"use strict";

import { parseMTL, parseMapArgs, parseOBJ } from "/js/parse.js";
import { vs, fs } from "/js/shaders.js";
import { getExtents, getGeometriesExtents, degToRad } from "/js/utils.js";

async function main() {
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  const objHref = "/resources/CabinetFix.obj";
  const response = await fetch(objHref);
  const text = await response.text();
  const obj = parseOBJ(text);
  const baseHref = new URL(objHref, window.location.href);
  const matTexts = await Promise.all(
    obj.materialLibs.map(async (filename) => {
      const matHref = new URL(filename, baseHref).href;
      const response = await fetch(matHref);
      return await response.text();
    })
  );
  const materials = parseMTL(matTexts.join("\n"));

  const defaultMaterial = {
    diffuse: [1.0, 0.9, 0.9],
    ambient: [0.2, 0.2, 0.2],
    specular: [1.0, 1.0, 1.0],
    shininess: 200,
    opacity: 1.0,
    emissive: [0.1, 0.1, 0.1],
  };

  const parts = obj.geometries.map(({ material, data }) => {
    if (data.color) {
      if (data.position.length === data.color.length) {
        data.color = { numComponents: 3, data: data.color };
      }
    } else {
      data.color = { value: [1, 1, 1, 1] };
    }

    const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
    return {
      material: materials[material] || defaultMaterial,
      bufferInfo,
    };
  });

  const extents = getGeometriesExtents(obj.geometries);
  const range = m4.subtractVectors(extents.max, extents.min);
  const objOffset = m4.scaleVector(
    m4.addVectors(extents.min, m4.scaleVector(range, 0.5)),
    -1
  );
  const cameraTarget = [0, 0, 0];

  const radius = m4.length(range) * 1.2;
  const cameraPosition = m4.addVectors(cameraTarget, [0, 0, radius]);

  const zNear = radius / 100;
  const zFar = radius * 3;

  // Variabel untuk kontrol freeze
  let freeze = false;
  let elapsedTime = 0; // Total waktu berjalan
  let previousTime = 0; // Waktu frame terakhir (untuk delta)

  // Event listener untuk mouse click
  function onMouseClick(event) {
    freeze = !freeze;
  }
  document.addEventListener("click", onMouseClick, false);

  // Event listener untuk keydown dan keyup (spasi)
  function onKeydown(event) {
    if (event.keyCode === 32) {
      freeze = true;
    }
  }

  function onKeyup(event) {
    if (event.keyCode === 32) {
      freeze = false;
    }
  }

  document.addEventListener("keydown", onKeydown, false);
  document.addEventListener("keyup", onKeyup, false);

  function render(currentTime) {
    currentTime *= 0.001; // Konversi waktu ke detik
    const deltaTime = currentTime - previousTime; // Hitung delta waktu
    previousTime = currentTime; // Simpan waktu sekarang untuk frame berikutnya

    // Tambahkan ke waktu total hanya jika animasi tidak freeze
    if (!freeze) {
      elapsedTime += deltaTime;
    }

    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);

    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);

    const view = m4.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: m4.normalize([-0.5, 0.5, 1]),
      u_ambientLight: [0.3, 0.3, 0.3],
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };

    gl.useProgram(meshProgramInfo.program);

    webglUtils.setUniforms(meshProgramInfo, sharedUniforms);

    // Gunakan `elapsedTime` untuk menghitung rotasi
    let u_world = m4.yRotation(elapsedTime);
    u_world = m4.xRotate(u_world, degToRad(-360));
    u_world = m4.translate(u_world, ...objOffset);

    for (const { bufferInfo, material } of parts) {
      webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
      webglUtils.setUniforms(
        meshProgramInfo,
        {
          u_world,
        },
        material
      );
      webglUtils.drawBufferInfo(gl, bufferInfo);
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main();
