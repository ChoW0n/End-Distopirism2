using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace EndDistopirism.Presentation.EditorTools
{
    //캐릭터 매니페스트(assets/<캐릭터>/sprite-manifest.json)로 액터의 장 칸을 채운다 (SPEC-005 §9.4)
    //웹 3D 무대와 같은 규칙으로 맞춘다
    //- 발 기준점: 장마다 anchor 가 스프라이트 피벗이다
    //- 크기: 대기 장의 발~머리 픽셀 높이가 월드 키(characterHeight, 웹 2.0)가 되게 Pixels Per Unit 을 정한다
    //- 장 이름: 00-idle · 01-advance · 02-retreat · 03-guard · 04-hit, 슬롯은 1n-skilln-ready → 01-peak → 나머지 궤적
    public static class Limbus25DManifestImporter
    {
        //웹 stage3d.json layout.characterHeight 와 같다
        private const float CharacterHeight = 2.0f;

        [Serializable]
        private sealed class Manifest
        {
            public string character;
            public int[] canvas;
            public Frame[] frames;
        }

        [Serializable]
        private sealed class Frame
        {
            public string id;
            public string file;
            public float[] anchor;
            public int[] bbox;
        }

        //고른 액터에 매니페스트를 적용한다
        [MenuItem("End-Distopirism/매니페스트로 액터 장 채우기")]
        private static void FillSelected()
        {
            Limbus25DActor actor = Selection.activeGameObject != null ? Selection.activeGameObject.GetComponent<Limbus25DActor>() : null;
            if (actor == null)
            {
                EditorUtility.DisplayDialog("매니페스트", "Limbus25DActor 가 붙은 오브젝트를 먼저 고른다", "확인");
                return;
            }
            string picked = EditorUtility.OpenFilePanel("sprite-manifest.json 고르기", Application.dataPath, "json");
            if (string.IsNullOrEmpty(picked)) return;
            string full = Path.GetFullPath(picked).Replace('\\', '/');
            string root = Path.GetFullPath(Application.dataPath).Replace('\\', '/');
            if (!full.StartsWith(root))
            {
                EditorUtility.DisplayDialog("매니페스트", "매니페스트와 그림은 프로젝트 Assets 안에 있어야 한다", "확인");
                return;
            }
            string assetPath = "Assets" + full.Substring(root.Length);
            Apply(actor, assetPath);
        }

        [MenuItem("End-Distopirism/매니페스트로 액터 장 채우기", true)]
        private static bool FillSelectedValid()
        {
            return Selection.activeGameObject != null && Selection.activeGameObject.GetComponent<Limbus25DActor>() != null;
        }

        //매니페스트를 읽어 그림 임포트 설정을 맞추고 액터 칸에 넣는다
        public static void Apply(Limbus25DActor actor, string manifestAssetPath)
        {
            var manifest = JsonUtility.FromJson<Manifest>(File.ReadAllText(manifestAssetPath));
            if (manifest == null || manifest.frames == null || manifest.frames.Length == 0 || manifest.canvas == null || manifest.canvas.Length < 2)
            {
                Debug.LogError($"매니페스트를 읽지 못했다: {manifestAssetPath}");
                return;
            }
            string dir = Path.GetDirectoryName(manifestAssetPath).Replace('\\', '/');
            Frame idle = manifest.frames.FirstOrDefault(f => f.id.EndsWith("idle")) ?? manifest.frames[0];
            float idleHeight = idle.anchor[1] - idle.bbox[1];
            float ppu = Mathf.Max(1f, idleHeight / CharacterHeight);

            //같은 그림을 여러 장이 나눠 쓴다. 그림마다 한 번만 맞춘다
            var sprites = new Dictionary<string, Sprite>();
            foreach (Frame frame in manifest.frames)
            {
                if (sprites.ContainsKey(frame.file)) continue;
                string path = $"{dir}/{frame.file}";
                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer == null)
                {
                    Debug.LogWarning($"그림이 없다: {path}");
                    sprites[frame.file] = null;
                    continue;
                }
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.alphaIsTransparency = true;
                importer.mipmapEnabled = false;
                importer.spritePixelsPerUnit = ppu;
                var settings = new TextureImporterSettings();
                importer.ReadTextureSettings(settings);
                settings.spriteAlignment = (int)SpriteAlignment.Custom;
                //유니티 피벗은 왼아래 원점, 매니페스트 anchor 는 왼위 원점 픽셀이다
                settings.spritePivot = new Vector2(frame.anchor[0] / manifest.canvas[0], 1f - frame.anchor[1] / manifest.canvas[1]);
                importer.SetTextureSettings(settings);
                importer.SaveAndReimport();
                sprites[frame.file] = AssetDatabase.LoadAssetAtPath<Sprite>(path);
            }

            Sprite Of(Frame f) => f != null && sprites.TryGetValue(f.file, out Sprite s) ? s : null;
            Frame Ending(string suffix) => manifest.frames.FirstOrDefault(f => f.id.EndsWith(suffix));
            Frame[] Slot(int n) => manifest.frames.Where(f => f.id.Contains($"skill{n}")).ToArray();

            var so = new SerializedObject(actor);
            so.FindProperty("idle").objectReferenceValue = Of(Ending("idle"));
            so.FindProperty("dash").objectReferenceValue = Of(Ending("advance"));
            so.FindProperty("recover").objectReferenceValue = Of(Ending("retreat"));
            so.FindProperty("guard").objectReferenceValue = Of(Ending("guard"));
            so.FindProperty("hurt").objectReferenceValue = Of(Ending("hit"));
            for (int n = 1; n <= 3; n++)
            {
                Frame[] seq = Slot(n);
                SerializedProperty set = so.FindProperty($"skill{n}");
                set.FindPropertyRelative("ready").objectReferenceValue = seq.Length > 0 ? Of(seq[0]) : null;
                set.FindPropertyRelative("peak").objectReferenceValue = seq.Length > 1 ? Of(seq[1]) : null;
                SerializedProperty trail = set.FindPropertyRelative("trail");
                trail.arraySize = Mathf.Max(0, seq.Length - 2);
                for (int i = 2; i < seq.Length; i++) trail.GetArrayElementAtIndex(i - 2).objectReferenceValue = Of(seq[i]);
                if (n == 1)
                {
                    //슬롯을 모르는 옛 신호에 쓰는 공용 장은 S1 장으로 채운다
                    so.FindProperty("windup").objectReferenceValue = seq.Length > 0 ? Of(seq[0]) : null;
                    so.FindProperty("strike").objectReferenceValue = seq.Length > 1 ? Of(seq[1]) : null;
                    SerializedProperty legacy = so.FindProperty("strikeTrail");
                    legacy.arraySize = Mathf.Max(0, seq.Length - 1);
                    for (int i = 1; i < seq.Length; i++) legacy.GetArrayElementAtIndex(i - 1).objectReferenceValue = Of(seq[i]);
                }
            }
            so.ApplyModifiedProperties();

            //그림 판에도 대기 장을 건다
            SpriteRenderer renderer = actor.GetComponentInChildren<SpriteRenderer>();
            if (renderer != null)
            {
                Undo.RecordObject(renderer, "매니페스트 대기 장");
                renderer.sprite = Of(Ending("idle"));
            }
            Debug.Log($"{manifest.character}: 장 {manifest.frames.Length}개, Pixels Per Unit {ppu:0.##} (대기 장 키 {idleHeight}px = 월드 {CharacterHeight})", actor);
        }
    }
}
