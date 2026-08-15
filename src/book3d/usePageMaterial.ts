/* The editorial paper material, shared by every mode that renders captured
   pages as meshes (the reading book's stacks and leaf, and Drift's floating
   sheets). One implementation keeps the WebGL paper pixel-identical across
   modes, which the DOM handoff depends on. */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getPageTexture, onTexturesChanged } from "./pageTextures";
import { injectPaperActivity } from "./paperMaterial";
import { withBasePath } from "@/lib/basePath";

export function usePaperBumpTexture() {
  return useMemo(() => {
    const texture = new THREE.TextureLoader().load(
      withBasePath("/images/editorial/paper-fiber.webp"),
    );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 7);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, []);
}

export function usePageMaterial(
  key: string | null,
  mirror = false,
  paperBump?: THREE.Texture,
  side: THREE.Side = THREE.FrontSide,
) {
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      side,
      roughness: 0.46,
      metalness: 0,
      bumpMap: paperBump,
      bumpScale: 0.08,
      sheen: 0.32,
      sheenColor: new THREE.Color(0xffffff),
      sheenRoughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.16,
      specularIntensity: 0.75,
      ior: 1.45,
    });
    m.userData.paperActivity = 0;
    // The captured texture already contains the persistent page sheen. Gate
    // every physical term to motion so stacks and turn endpoints reproduce
    // those same pixels, while a bending leaf gains only a restrained accent.
    m.onBeforeCompile = (shader) => {
      shader.uniforms.paperActivity = {
        value: Number(m.userData.paperActivity ?? 0),
      };
      m.userData.paperShader = shader;
      shader.fragmentShader = injectPaperActivity(shader.fragmentShader);
    };
    m.customProgramCacheKey = () => "editorial-paper-lighting-v6";
    return m;
  }, [paperBump, side]);
  // Track the applied SOURCE texture, not the key: a refreshed capture keeps
  // the key but swaps the texture object, and the material must follow.
  const applied = useRef<THREE.Texture | null>(null);
  useLayoutEffect(() => {
    const apply = () => {
      const texture = key ? getPageTexture(key) : null;
      if (texture && applied.current !== texture) {
        if (mirror && mat.map) mat.map.dispose();
        const t = mirror ? texture.clone() : texture;
        if (mirror) {
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.x = -1;
          t.offset.x = 1;
        }
        mat.map = t;
        mat.needsUpdate = true;
        applied.current = texture;
      } else if (!texture && applied.current !== null) {
        if (mirror && mat.map) mat.map.dispose();
        mat.map = null;
        mat.needsUpdate = true;
        applied.current = null;
      }
    };
    // A turn hides the live DOM in the same commit that selects this leaf.
    // Attach its cached page (including the baked-in gutter) before paint so
    // there is never a blank first WebGL frame at drag/flip start.
    apply();
    return onTexturesChanged(apply);
  }, [key, mat, mirror]);
  // Unmount hygiene: mirrored clones are private to this material and must be
  // released with it. The un-mirrored map is the shared page cache's texture
  // and is never disposed here — the cache owns its lifetime.
  useLayoutEffect(
    () => () => {
      if (mirror && mat.map) mat.map.dispose();
      mat.dispose();
    },
    [mat, mirror],
  );
  return mat;
}

export function setPaperMaterialActivity(
  material: THREE.Material,
  activity: number,
) {
  material.userData.paperActivity = activity;
  const shader = material.userData.paperShader as
    | { uniforms: { paperActivity?: { value: number } } }
    | undefined;
  if (shader?.uniforms.paperActivity) {
    shader.uniforms.paperActivity.value = activity;
  }
}
