import promiseUtils = require("esri/core/promiseUtils");
/**
 */
type HSize = [number, number];

interface HPoint {
    r: number,
    c: number,
    w: number
}

class HMatrix {
    size: number;
    cols: number;
    farr: Float32Array;

    constructor(numRows: number, numCols: number) {
        this.size = numRows * numCols;
        this.cols = numCols;
        this.farr = new Float32Array(this.size);
    }

    update(r: number, c: number, w: number) {
        const index = r * this.cols + c;
        this.farr[index] += w;
    }

}

class KernelCalculator {
    lastRadius: number = -1.0;
    blurSize: number = 0.0;
    kernel: Float32Array;

    calculateKernel(pointArr: Array<HPoint>, size: HSize, radius: number) {
        const [numRows, numCols] = size;
        const maxRows = numRows - 1;
        const maxCols = numCols - 1;
        const numPoints = pointArr.length;
        // Calculate the kernel
        if (this.lastRadius !== radius) {
            this.lastRadius = radius;
            this.blurSize = Math.round(radius * 2.0);
            const deno = -2.0 * radius * radius;
            const nume = radius / (2.0 * Math.sqrt(2.0 * Math.PI));
            const kernelSize = this.blurSize * 2 + 1;
            this.kernel = new Float32Array(kernelSize);
            for (let i = 0; i < kernelSize; i++) {
                const d0 = i - this.blurSize;
                const d2 = d0 * d0;
                this.kernel[i] = Math.exp(d2 / deno) * nume;
            }
        }
        // Update "2D" matrix values with kernel weighting
        const matrix = new HMatrix(numRows, numCols);
        for (let i = 0; i < numPoints; i++) {
            const py = pointArr[i].r;
            const px = pointArr[i].c;
            const sc = px - this.blurSize;
            const sr = py - this.blurSize;
            const cmin = Math.max(0, sc);
            const cmax = Math.min(maxCols, px + this.blurSize);
            const rmin = Math.max(0, sr);
            const rmax = Math.min(maxRows, py + this.blurSize);
            for (let r = rmin; r <= rmax; r++) {
                const ky = this.kernel[r - sr];
                for (let c = cmin; c <= cmax; c++) {
                    matrix.update(r, c, pointArr[i].w * ky * this.kernel[c - sc]);
                }
            }
        }
        return matrix.farr;
    }

}

export = KernelCalculator;
