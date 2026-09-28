using System.Collections.Generic;
using DG.Tweening;
using UnityEngine;

namespace EndDistopirism.Presentation
{
    //원근으로 그려진 배경 층들을 기준 카메라에서 비춰 판에 입힌다 (SPEC-005 §8.8)
    //기준 카메라에서 보면 원화 합성과 똑같고, 카메라가 움직이면 층의 깊이만큼 시차가 난다
    //원근으로 그려진 바닥 그림을 평평한 판에 반복해 깔면 원근이 두 번 들어가 바닥이 뒤틀린다. 그걸 막는 것이 이 컴포넌트다
    //연출 감독이 카메라 대기 자세를 기억하기 전에 카메라를 맞춰야 해서 먼저 돈다
    [DefaultExecutionOrder(-100)]
    public sealed class Limbus25DStageBackdrop : MonoBehaviour
    {
        //층 모양. 세운 판이거나 바닥 판이다
        public enum Shape { Stand, Floor }

        //배경 한 층. 수치는 assets/<맵>/placement.json 의 projection 과 같다
        [System.Serializable]
        public sealed class Layer
        {
            public string name = "layer";
            public Texture2D texture;
            public Shape shape = Shape.Stand;
            [Tooltip("원화 합성에서 이 층이 놓인 화면 자리. 좌상단 원점, 화면 너비·높이 기준 (x, y, 너비, 높이)")]
            public Rect screenRect = new Rect(0f, 0f, 1f, 1f);
            [Tooltip("세운 판: 화면 자리를 바닥 경계 가운데 기준으로 키우는 배율. 측면 회전 때 원화만으로 좌우를 덮는다")]
            public float scale = 1f;
            [Tooltip("세운 판: 키운 뒤 화면 아래로 내리는 양(화면 높이 비율). 구조물 밑동을 바닥 턱 뒤로 묻는다")]
            public float offsetY = 0f;
            [Tooltip("세운 판: 무대 줄(z=0)에서 뒤로 떨어진 거리. 음수면 카메라 쪽(근경)")]
            public float depth = 20f;
            [Tooltip("바닥 판: 카메라 쪽 끝(음수)과 먼 쪽 끝")]
            public Vector2 floorRange = new Vector2(-14f, 40f);
            [Tooltip("바닥 판: 좌우 반폭")]
            public float halfWidth = 120f;
            [Tooltip("그림 좌우 밖을 거울로 이어 붙인다. 카메라가 측면으로 돌 때 원화 밖이 보인다")]
            public bool mirrorOutsideX = true;
            [Tooltip("그림 위아래 밖을 거울로 이어 붙인다. 바닥만 켠다 (초점 카메라가 원화보다 가까운 바닥을 볼 때 줄무늬 방지)")]
            public bool mirrorOutsideY;
            public int sortingOrder = -30;
            [Tooltip("판을 잘게 나눈 수. 투영 좌표를 꼭짓점마다 구하므로 바닥은 촘촘해야 한다")]
            public Vector2Int segments = new Vector2Int(24, 24);
            [Tooltip("교전 중에는 숨기고 교전 사이에만 보인다. 근경에 켠다 (SPEC-005 §9.5.1)")]
            public bool hideInCombat;
        }

        [Header("기준 카메라 (원화 합성과 맞춘 대기 카메라)")]
        [Tooltip("비어 있으면 Main Camera")]
        [SerializeField] private Camera targetCamera;
        [Tooltip("시작할 때 카메라를 기준 자세로 옮긴다. 연출 감독이 이 자세를 대기 자세로 기억한다")]
        [SerializeField] private bool alignCameraOnAwake = true;
        [Tooltip("무대 줄 앞으로 떨어진 거리와 높이 (제3 수문: 발 0.765 · 키 0.24 · 바닥 뒤 경계 0.487 을 맞춘 값)")]
        [SerializeField] private float cameraBack = 11.46f;
        [SerializeField] private float cameraHeight = 3.96f;
        [Tooltip("무대 줄(z=0)에서 카메라가 바라보는 높이")]
        [SerializeField] private float lookAtHeight = 2.202f;
        [SerializeField] private float fieldOfView = 38f;
        [SerializeField] private float aspect = 1672f / 941f;
        [Tooltip("세운 층을 기준 카메라 화면 좌우로 몇 배까지 넓게 세울지. 카메라가 측면으로 24° 돌아도 덮는다")]
        [SerializeField] private float standSpread = 4f;

        [Tooltip("층을 키울 때 기준점. 화면 좌상단 원점 비율 (바닥 경계 가운데)")]
        [SerializeField] private Vector2 scaleAnchor = new Vector2(0.5f, 0.467f);

        [Header("재질")]
        [Tooltip("투명 언릿 재질. 비어 있으면 Sprites/Default 로 만든다")]
        [SerializeField] private Material baseMaterial;

        [Header("층 (먼 것부터). 기본값은 제3 수문 (assets/map-gate3/placement.json)")]
        [SerializeField] private List<Layer> layers = new List<Layer>
        {
            new Layer { name = "far", shape = Shape.Stand, depth = 70f, scale = 2.1f, sortingOrder = -30, segments = new Vector2Int(96, 24) },
            new Layer { name = "booth", shape = Shape.Stand, depth = 19f, scale = 2.0f, sortingOrder = -20, segments = new Vector2Int(96, 24) },
            new Layer { name = "floor", shape = Shape.Floor, floorRange = new Vector2(-14f, 40f), halfWidth = 120f, mirrorOutsideY = true, sortingOrder = -10, segments = new Vector2Int(240, 160) },
            new Layer { name = "water", shape = Shape.Floor, floorRange = new Vector2(-14f, 40f), halfWidth = 120f, mirrorOutsideX = false, sortingOrder = -9, segments = new Vector2Int(240, 160) },
            new Layer { name = "front", shape = Shape.Stand, depth = -4f, scale = 1f, mirrorOutsideX = false, sortingOrder = 50, hideInCombat = true, segments = new Vector2Int(96, 24) },
        };

        //기준 카메라의 월드→클립 행렬과 자세
        private Matrix4x4 paintViewProjection;
        private Vector3 paintPosition;
        private Quaternion paintRotation;
        private readonly List<GameObject> built = new List<GameObject>();
        //교전 중에 숨길 층의 재질 (근경)
        private readonly List<Material> combatHidden = new List<Material>();

        //기준 카메라를 세우고, 층마다 판을 만들어 비춘다
        private void Awake()
        {
            if (targetCamera == null) targetCamera = Camera.main;
            BuildPaintCamera();
            if (alignCameraOnAwake && targetCamera != null)
            {
                targetCamera.transform.SetPositionAndRotation(paintPosition, paintRotation);
                targetCamera.fieldOfView = fieldOfView;
            }
            Rebuild();
        }

        //기준 카메라 자세와 행렬을 구한다. 유니티는 카메라가 +Z 를 보므로 배경은 +Z 쪽에 둔다
        private void BuildPaintCamera()
        {
            paintPosition = new Vector3(0f, cameraHeight, -cameraBack);
            paintRotation = Quaternion.LookRotation(new Vector3(0f, lookAtHeight, 0f) - paintPosition, Vector3.up);
            Matrix4x4 view = Matrix4x4.TRS(paintPosition, paintRotation, new Vector3(1f, 1f, -1f)).inverse;
            Matrix4x4 projection = Matrix4x4.Perspective(fieldOfView, aspect, 0.1f, 500f);
            paintViewProjection = projection * view;
        }

        //만든 판을 지우고 다시 만든다. 인스펙터 값을 바꾼 뒤 불러도 된다
        public void Rebuild()
        {
            foreach (GameObject go in built) if (go != null) Destroy(go);
            built.Clear();
            combatHidden.Clear();
            foreach (Layer layer in layers)
            {
                if (layer.texture == null) continue;
                built.Add(layer.shape == Shape.Floor ? BuildFloor(layer) : BuildStand(layer));
            }
        }

        //세운 판. 기준 카메라 화면보다 좌우로 넓게 그 깊이의 평면에 세운다
        private GameObject BuildStand(Layer layer)
        {
            float z = layer.depth;
            Vector3 a = RayToZ(-standSpread, 1.3f, z);
            Vector3 b = RayToZ(standSpread, -1.3f, z);
            var corners = new[] { new Vector3(a.x, b.y, z), new Vector3(b.x, b.y, z), new Vector3(a.x, a.y, z), new Vector3(b.x, a.y, z) };
            Rect rect = ScaledRect(layer.screenRect, layer.scale);
            rect.y += layer.offsetY;
            return BuildGrid(layer, corners, rect);
        }

        //층의 화면 자리를 기준점에서 키운다. 구조물 밑동이 바닥 경계에 그대로 붙어 있다
        private Rect ScaledRect(Rect r, float k)
        {
            k = Mathf.Max(0.01f, k);
            return new Rect(scaleAnchor.x + (r.x - scaleAnchor.x) * k, scaleAnchor.y + (r.y - scaleAnchor.y) * k, r.width * k, r.height * k);
        }

        //바닥 판. y=0 평면에 카메라 쪽부터 먼 쪽까지 깐다
        private GameObject BuildFloor(Layer layer)
        {
            float near = layer.floorRange.x;
            float far = layer.floorRange.y;
            float w = layer.halfWidth;
            var corners = new[] { new Vector3(-w, 0f, near), new Vector3(w, 0f, near), new Vector3(-w, 0f, far), new Vector3(w, 0f, far) };
            return BuildGrid(layer, corners, layer.screenRect);
        }

        //네 모서리(왼아래·오른아래·왼위·오른위)로 격자 판을 만들고 꼭짓점마다 투영 좌표를 넣는다
        private GameObject BuildGrid(Layer layer, Vector3[] c, Rect rect)
        {
            int nx = Mathf.Max(1, layer.segments.x);
            int ny = Mathf.Max(1, layer.segments.y);
            var vertices = new Vector3[(nx + 1) * (ny + 1)];
            var uvs = new Vector2[vertices.Length];
            var triangles = new int[nx * ny * 6];
            for (int j = 0; j <= ny; j++)
            {
                float v = (float)j / ny;
                Vector3 left = Vector3.Lerp(c[0], c[2], v);
                Vector3 right = Vector3.Lerp(c[1], c[3], v);
                for (int i = 0; i <= nx; i++)
                {
                    int k = j * (nx + 1) + i;
                    vertices[k] = Vector3.Lerp(left, right, (float)i / nx);
                    uvs[k] = ProjectUV(vertices[k], rect);
                }
            }
            int t = 0;
            for (int j = 0; j < ny; j++)
            {
                for (int i = 0; i < nx; i++)
                {
                    int k = j * (nx + 1) + i;
                    //카메라 쪽에서 보이게 감는 방향을 맞춘다
                    triangles[t++] = k; triangles[t++] = k + nx + 1; triangles[t++] = k + 1;
                    triangles[t++] = k + 1; triangles[t++] = k + nx + 1; triangles[t++] = k + nx + 2;
                }
            }
            var mesh = new Mesh { name = layer.name, indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            mesh.vertices = vertices;
            mesh.uv = uvs;
            mesh.triangles = triangles;
            mesh.RecalculateBounds();

            var go = new GameObject("Backdrop_" + layer.name);
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            Material material = baseMaterial != null ? new Material(baseMaterial) : new Material(Shader.Find("Sprites/Default"));
            material.mainTexture = layer.texture;
            layer.texture.wrapModeU = layer.mirrorOutsideX ? TextureWrapMode.Mirror : TextureWrapMode.Clamp;
            layer.texture.wrapModeV = layer.mirrorOutsideY ? TextureWrapMode.Mirror : TextureWrapMode.Clamp;
            renderer.sharedMaterial = material;
            if (layer.hideInCombat) combatHidden.Add(material);
            renderer.sortingOrder = layer.sortingOrder;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return go;
        }

        //교전이 시작되면 근경을 흐려 숨기고, 교전 사이에는 다시 보인다 (SPEC-005 §9.5.1)
        //실제 시간으로 돈다. 역경직에 멈추지 않는다
        public void SetCombat(bool inCombat, float seconds)
        {
            float target = inCombat ? 0f : 1f;
            foreach (Material material in combatHidden)
            {
                if (material == null) continue;
                material.DOKill();
                //URP 언릿은 _BaseColor, 스프라이트 기본 재질은 _Color 에 색이 있다
                string property = material.HasProperty("_BaseColor") ? "_BaseColor" : "_Color";
                material.DOFade(target, property, Mathf.Max(0f, seconds)).SetUpdate(true).SetLink(gameObject);
            }
        }

        //월드 한 점을 기준 카메라 화면에 찍어 그 층 그림의 좌표로 바꾼다
        private Vector2 ProjectUV(Vector3 world, Rect rect)
        {
            Vector4 clip = paintViewProjection * new Vector4(world.x, world.y, world.z, 1f);
            float w = Mathf.Abs(clip.w) < 1e-5f ? 1e-5f : clip.w;
            float sx = (clip.x / w + 1f) * 0.5f;
            float syFromTop = (1f - clip.y / w) * 0.5f;
            return new Vector2((sx - rect.x) / rect.width, 1f - (syFromTop - rect.y) / rect.height);
        }

        //기준 카메라 화면의 한 점(정규 좌표)에서 쏜 선이 z 평면과 만나는 곳
        private Vector3 RayToZ(float nx, float ny, float z)
        {
            float tan = Mathf.Tan(fieldOfView * 0.5f * Mathf.Deg2Rad);
            Vector3 dir = paintRotation * new Vector3(nx * tan * aspect, ny * tan, 1f);
            float s = (z - paintPosition.z) / dir.z;
            return paintPosition + dir * s;
        }
    }
}
