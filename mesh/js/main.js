require({
    packages: [{
        name: "app",
        location: window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/js'
    }]
}, [
    "dojo/dom",
    "dojo/dom-attr",
    "dojo/dom-class",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/_base/lang",
    "dojo/on",
    "esri/Map",
    "esri/Camera",
    "esri/Color",
    "esri/geometry/SpatialReference",
    "esri/geometry/Extent",
    "esri/views/SceneView",
    "esri/views/3d/externalRenderers",
    "esri/core/declare",
    "dijit/ColorPalette",
    "dijit/form/HorizontalSlider",
    "app/kernel",
    "app/heat",
    "dojo/domReady!"
], function (dom,
             domAttr,
             domClass,
             domConstruct,
             domStyle,
             lang,
             on,
             Map,
             Camera,
             Color,
             SpatialReference,
             Extent,
             SceneView,
             externalRenderers,
             declare,
             ColorPalette,
             HorizontalSlider,
             KernelCalculator,
             appHeat) {

    "use strict";

    const appData = appHeat.data.data;
    const appMesh = appHeat.mesh;

    const MeshRend = declare(null, {
        view: null,
        vertices: appMesh.vertices,
        program: null,
        pMatrixUniform: null,
        vMatrixUniform: null,
        aPosition: null,
        uColorOrig: null,
        uColorDest: null,
        aMult: null,
        bufPosition: null,
        bufMult: null,
        bufIndex: null,
        arrPosition: new Float32Array(3 * appMesh.length),
        arrColorOrig: [0, 0, 0],
        arrColorDest: [0, 0, 0],
        arrMult: new Float32Array(appMesh.length),
        /**
         * Dojo constructor
         */
        constructor: function (view) {
            this.view = view;
        },
        /**
         * Called once after this external renderer is added to the scene.
         * This is part of the external renderer interface.
         */
        setup: function (context) {
            try {
                this.initShaders(context);
            } finally {
                context.resetWebGLState();
            }
        },
        /**
         * Called each time the scene is rendered.
         * This is part of the external renderer interface.
         */
        render: function (context) {
            const gl = context.gl;

            gl.useProgram(this.program);

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(
                gl.SRC_ALPHA,
                gl.ONE_MINUS_SRC_ALPHA,
                gl.ONE,
                gl.ONE_MINUS_SRC_ALPHA
            );

            var camera = context.camera;
            gl.uniformMatrix4fv(this.pMatrixUniform, false, camera.projectionMatrix);
            gl.uniformMatrix4fv(this.vMatrixUniform, false, camera.viewMatrix);

            externalRenderers.toRenderCoordinates(
                this.view,
                this.vertices,
                0,
                SpatialReference.WGS84,
                this.arrPosition,
                0,
                appMesh.length);

            this.draw(gl);

            externalRenderers.requestRender(this.view);
            // cleanup
            context.resetWebGLState();
            // fix for bug in the JS API 4.2, related to RibbonLineMaterial
            gl.blendFuncSeparate(
                gl.SRC_ALPHA,
                gl.ONE_MINUS_SRC_ALPHA,
                gl.ONE,
                gl.ONE_MINUS_SRC_ALPHA
            );
        },
        draw: function (gl) {
            gl.uniform3fv(this.uColorOrig, new Float32Array(this.arrColorOrig));
            gl.uniform3fv(this.uColorDest, new Float32Array(this.arrColorDest));

            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPosition);
            gl.bufferData(gl.ARRAY_BUFFER, this.arrPosition, gl.STATIC_DRAW);
            gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(this.aPosition);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufMult);
            gl.bufferData(gl.ARRAY_BUFFER, this.arrMult, gl.STATIC_DRAW);
            gl.vertexAttribPointer(this.aMult, 1, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(this.aMult);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIndex);

            const glMode = _mode !== "mesh" ? gl.TRIANGLES : gl.LINES;
            gl.drawElements(glMode, appMesh.indices.length, gl.UNSIGNED_SHORT, 0);
        },
        initShaders: function (context) {
            const gl = context.gl;
            const v = 'uniform mat4 uPMatrix;' +
                'uniform mat4 uVMatrix;' +
                'attribute vec3 aPosition;' +
                'attribute float aMult;' +
                'varying float vMult;' +
                'void main(void) {' +
                'vMult = clamp(aMult*2.0,0.0,0.95);' +
                'gl_Position = uPMatrix * uVMatrix * vec4(aPosition, 1.0);' +
                'gl_Position.z -= 1.0;' +
                '}';
            const f = 'precision mediump float;' +
                'uniform vec3 uColorOrig;' +
                'uniform vec3 uColorDest;' +
                'varying float vMult;' +
                'void main(void) {' +
                'gl_FragColor = (1.0 - vMult) * vec4(uColorOrig, vMult) + vMult * vec4(uColorDest, vMult);' +
                '}';

            const vShader = gl.createShader(gl.VERTEX_SHADER);
            const fShader = gl.createShader(gl.FRAGMENT_SHADER);

            gl.shaderSource(vShader, v);
            gl.shaderSource(fShader, f);

            gl.compileShader(vShader);
            if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
                alert(gl.getShaderInfoLog(vShader));
                return;
            }
            gl.compileShader(fShader);
            if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
                alert(gl.getShaderInfoLog(fShader));
                return;
            }

            this.program = gl.createProgram();

            gl.attachShader(this.program, vShader);
            gl.attachShader(this.program, fShader);

            gl.linkProgram(this.program);
            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                alert(gl.getShaderInfoLog(this.program));
                return;
            }

            this.pMatrixUniform = gl.getUniformLocation(this.program, 'uPMatrix');
            this.vMatrixUniform = gl.getUniformLocation(this.program, 'uVMatrix');

            this.aPosition = gl.getAttribLocation(this.program, 'aPosition');
            this.uColorOrig = gl.getUniformLocation(this.program, 'uColorOrig');
            this.uColorDest = gl.getUniformLocation(this.program, 'uColorDest');
            this.aMult = gl.getAttribLocation(this.program, 'aMult');

            this.bufPosition = gl.createBuffer();
            this.bufMult = gl.createBuffer();
            this.bufIndex = gl.createBuffer();

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIndex);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(appMesh.indices), gl.STATIC_DRAW);
        }
    });

    var map = new Map({
        basemap: 'dark-gray'
    });

    var view = new SceneView({
        container: 'panelView',
        map: map,
        extent: new Extent({xmin: appMesh.xmin, ymin: appMesh.ymin, xmax: appMesh.xmax, ymax: appMesh.ymax})
    });
    view.then(function () {
        updateUI();
    }, function (err) {
        alert('Error:' + err);
    });

    var _dtIndex = 0;
    var _mode = "mesh";
    var _origColor = "#0000ff";
    var _destColor = "#ff0000";
    var _radius = 2;
    var _meshRend;
    var _heatmapCalc;

    const _size = [appMesh.rows, appMesh.cols];

    function updateUI() {
        _meshRend = new MeshRend(view);
        externalRenderers.add(view, _meshRend);

        _heatmapCalc = new KernelCalculator();

        new HorizontalSlider({
            value: 0,
            minimum: 0,
            maximum: Math.max(0, appData.length - 1),
            discreteValues: appData.length,
            intermediateChanges: true,
            showButtons: false,
            style: "width:90%;",
            onChange: horizontalSlider_changeHandler
        }, "panelSlider").startup();

        on(dom.byId("icon"), "click", toggleSettings);
        on(dom.byId("switchMesh"), "click", lang.hitch(this, setMode, "mesh"));
        on(dom.byId("switchSurface"), "click", lang.hitch(this, setMode, "surface"));

        new ColorPalette({
            palette: "7x10",
            onChange: function (val) {
                changeOrigColor(val);
            }
        }, "startColor").startup();

        new ColorPalette({
            palette: "7x10",
            onChange: function (val) {
                changeDestColor(val);
            }
        }, "endColor").startup();

        new HorizontalSlider({
            value: 2,
            minimum: 1,
            maximum: 5,
            discreteValues: 10,
            intermediateChanges: true,
            showButtons: false,
            style: "width:90%;",
            onChange: radiusSlider_changeHandler
        }, "radiusSlider").startup();

        updateViz();
    }

    function updateViz() {
        const sRGB = normalizeRGB(Color.fromHex(_origColor).toRgb());
        const eRGB = normalizeRGB(Color.fromHex(_destColor).toRgb());
        const data = appData[_dtIndex];
        dom.byId("panelDate").innerHTML = data.datetime;
        const zArr = _heatmapCalc.calculateKernel(data.points, _size, _radius);
        const vertices = appMesh.vertices.slice(0);
        var z = 2;
        for (var i = 0; i < appMesh.length; i++) {
            vertices[z] = 25 + 2000 * zArr[i];
            z += 3;
        }
        _meshRend.arrColorOrig = sRGB;
        _meshRend.arrColorDest = eRGB;
        _meshRend.arrMult = zArr;
        _meshRend.vertices = vertices;
    }

    function normalizeRGB(rgb) {
        const r = rgb[0] / 255;
        const g = rgb[1] / 255;
        const b = rgb[2] / 255;
        return [r, g, b];
    }

    function horizontalSlider_changeHandler(index) {
        _dtIndex = index;
        updateViz();
    }

    function toggleSettings() {
        domClass.toggle("panelSettings", "open");
    }

    function setMode(value) {
        _mode = value;
        if (_mode === "mesh") {
            domClass.add("switchMesh", "on");
            domClass.remove("switchSurface", "on");
        } else {
            domClass.remove("switchMesh", "on");
            domClass.add("switchSurface", "on");
        }
    }

    function changeOrigColor(value) {
        _origColor = value;
        domStyle.set("startSwatch", "background-color", value);
        updateViz();
    }

    function changeDestColor(value) {
        _destColor = value;
        domStyle.set("endSwatch", "background-color", value);
        updateViz();
    }

    function radiusSlider_changeHandler(value) {
        _radius = value;
        updateViz();
    }

});
