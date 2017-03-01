define(["require", "exports"], function (require, exports) {
    "use strict";
    var HMatrix = (function () {
        function HMatrix(numRows, numCols) {
            this.size = numRows * numCols;
            this.cols = numCols;
            this.farr = new Float32Array(this.size);
        }
        HMatrix.prototype.update = function (r, c, w) {
            var index = r * this.cols + c;
            this.farr[index] += w;
        };
        return HMatrix;
    }());
    var KernelCalculator = (function () {
        function KernelCalculator() {
            this.lastRadius = -1.0;
            this.blurSize = 0.0;
        }
        KernelCalculator.prototype.calculateKernel = function (pointArr, size, radius) {
            var numRows = size[0], numCols = size[1];
            var maxRows = numRows - 1;
            var maxCols = numCols - 1;
            var numPoints = pointArr.length;
            // Calculate the kernel
            if (this.lastRadius !== radius) {
                this.lastRadius = radius;
                this.blurSize = Math.round(radius * 2.0);
                var deno = -2.0 * radius * radius;
                var nume = radius / (2.0 * Math.sqrt(2.0 * Math.PI));
                var kernelSize = this.blurSize * 2 + 1;
                this.kernel = new Float32Array(kernelSize);
                for (var i = 0; i < kernelSize; i++) {
                    var d0 = i - this.blurSize;
                    var d2 = d0 * d0;
                    this.kernel[i] = Math.exp(d2 / deno) * nume;
                }
            }
            // Update "2D" matrix values with kernel weighting
            var matrix = new HMatrix(numRows, numCols);
            for (var i = 0; i < numPoints; i++) {
                var py = pointArr[i].r;
                var px = pointArr[i].c;
                var sc = px - this.blurSize;
                var sr = py - this.blurSize;
                var cmin = Math.max(0, sc);
                var cmax = Math.min(maxCols, px + this.blurSize);
                var rmin = Math.max(0, sr);
                var rmax = Math.min(maxRows, py + this.blurSize);
                for (var r = rmin; r <= rmax; r++) {
                    var ky = this.kernel[r - sr];
                    for (var c = cmin; c <= cmax; c++) {
                        matrix.update(r, c, pointArr[i].w * ky * this.kernel[c - sc]);
                    }
                }
            }
            return matrix.farr;
        };
        return KernelCalculator;
    }());
    return KernelCalculator;
});
