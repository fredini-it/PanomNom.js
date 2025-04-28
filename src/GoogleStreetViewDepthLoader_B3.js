class GoogleStreetViewDepthLoader {
    constructor() {}
  
    async load(panoId) {
      const url = `https://www.google.com/maps/photometa/v1?authuser=0&hl=en&gl=uk&pb=!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1sen!2suk!3m3!1m2!1e2!2s${panoId}`;
      const res = await fetch(url);
      const text = await res.text();
      const json = JSON.parse(text.substr(4));
      const dm = json[1][0][5][0][5][1][2];
  
      let decoded, depthMap;
      try {
        decoded = this.decode(dm);
        depthMap = this.parse(decoded);
      } catch (e) {
        depthMap = this.createEmptyDepthMap();
        throw new Error(e);
      }
      this.depthMap = depthMap;
      return depthMap;
    }
  
    decode(rawDepthMap) {
      while (rawDepthMap.length % 4 != 0) rawDepthMap += "=";
      rawDepthMap = rawDepthMap.replace(/-/g, "+").replace(/_/g, "/");
      const decompressedDepthMap = atob(rawDepthMap);
      return new Uint8Array([...decompressedDepthMap].map(c => c.charCodeAt(0)));
    }
  
    parseHeader(depthMap) {
      return {
        headerSize: depthMap.getUint8(0),
        numberOfPlanes: depthMap.getUint16(1, true),
        width: depthMap.getUint16(3, true) * 2, // Dobrar a largura
        height: depthMap.getUint16(5, true) * 2, // Dobrar a altura
        offset: depthMap.getUint16(7, true),
      };
    }
  
    parsePlanes(header, depthMap) {
      const planes = [], indices = [];
      for (let i = 0; i < (header.width / 2) * (header.height / 2); i++) {
        indices.push(depthMap.getUint8(header.offset + i));
      }
      for (let i = 0; i < header.numberOfPlanes; i++) {
        const byteOffset = header.offset + (header.width / 2) * (header.height / 2) + i * 16;
        planes.push({
          n: [depthMap.getFloat32(byteOffset, true),
              depthMap.getFloat32(byteOffset + 4, true),
              depthMap.getFloat32(byteOffset + 8, true)],
          d: depthMap.getFloat32(byteOffset + 12, true),
        });
      }
      return { planes, indices };
    }
  
    computeDepthMap(header, indices, planes) {
      const w = header.width, h = header.height;
      const depthMap = new Float32Array(w * h);
      
      const sinTheta = Array.from({ length: h }, (_, y) => Math.sin(((h - y - 0.5) / h) * Math.PI));
      const cosTheta = Array.from({ length: h }, (_, y) => Math.cos(((h - y - 0.5) / h) * Math.PI));
      const sinPhi = Array.from({ length: w }, (_, x) => Math.sin(((w - x - 0.5) / w) * 2 * Math.PI + Math.PI / 2));
      const cosPhi = Array.from({ length: w }, (_, x) => Math.cos(((w - x - 0.5) / w) * 2 * Math.PI + Math.PI / 2));
  
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const origX = Math.floor(x / 2), origY = Math.floor(y / 2);
          const planeIdx = indices[origY * (w / 2) + origX];
  
          const v = [sinTheta[y] * cosPhi[x], sinTheta[y] * sinPhi[x], cosTheta[y]];
  
          depthMap[y * w + (w - x - 1)] = planeIdx > 0
            ? Math.abs(planes[planeIdx].d / (v[0] * planes[planeIdx].n[0] + v[1] * planes[planeIdx].n[1] + v[2] * planes[planeIdx].n[2]))
            : Number.MAX_SAFE_INTEGER;
        }
      }
  
      return { width: w, height: h, depthMap };
    }
  
    parse(depthMap) {
      const depthMapData = new DataView(depthMap.buffer);
      this.header = this.parseHeader(depthMapData);
      this.data = this.parsePlanes(this.header, depthMapData);
      return this.computeDepthMap(this.header, this.data.indices, this.data.planes);
    }
  
    createEmptyDepthMap() {
      return {
        width: 1024, height: 512,
        depthMap: new Float32Array(1024 * 512).fill(Number.MAX_SAFE_INTEGER),
      };
    }
  }
  
  export { GoogleStreetViewDepthLoader };
  