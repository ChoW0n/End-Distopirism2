using System.Threading.Tasks;
using UnityEngine;

namespace EndDistopirism.Presentation
{
    //카일 1대1 시험 무대. 전투 계산 자리에 아주 작은 가짜 계산을 두고, 결과만 연출 감독에 넘긴다 (SPEC-005 §8.1)
    //실제 전투에서는 도메인 이벤트를 PresentationCue 로 바꾸는 어댑터가 이 자리를 대신한다
    public sealed class Limbus25DDuelDemo : MonoBehaviour
    {
        [SerializeField] private Limbus25DEffectDirector director;
        [Tooltip("아군 자리(화면 왼쪽)에 서서 오른쪽을 본다. 장마다 다른 원화 방향은 액터가 맞춘다")]
        [SerializeField] private Limbus25DActor kyle;
        [Tooltip("적 자리(화면 오른쪽)")]
        [SerializeField] private Limbus25DActor enemy;

        [Header("가짜 계산")]
        [SerializeField] private int seed = 7;
        [SerializeField] private Vector2Int damageRange = new Vector2Int(6, 34);
        [Tooltip("이 피해 이상이면 흐트러짐")]
        [SerializeField] private int staggerAt = 26;
        [Tooltip("몇 번째 교전마다 맞부딪힘으로 할지")]
        [SerializeField] private int clashEvery = 3;
        [SerializeField] private float pauseBetween = 0.45f;
        [SerializeField] private bool autoPlay = true;

        private System.Random rng;
        private int exchange;
        private bool looping;

        //양쪽을 마주 보게 세우고 자리를 기억한다
        private void Start()
        {
            rng = new System.Random(seed);
            kyle.SetPlayerSide(true);
            enemy.SetPlayerSide(false);
            kyle.SetFacing(1);
            enemy.SetFacing(-1);
            kyle.MarkHome();
            enemy.MarkHome();
            if (autoPlay) _ = LoopAsync();
        }

        private void OnDisable()
        {
            looping = false;
        }

        //교전을 하나씩 계산해 넘기고, 연출이 끝나면 잠깐 쉬고 다음을 넘긴다
        private async Task LoopAsync()
        {
            looping = true;
            while (looping && isActiveAndEnabled)
            {
                PlayOne();
                while (looping && director != null && director.IsBusy) await Task.Yield();
                float until = Time.unscaledTime + pauseBetween;
                while (looping && Time.unscaledTime < until) await Task.Yield();
            }
        }

        //교전 한 건을 계산해 넘긴다. 버튼에 물려 수동으로도 쓴다
        public void PlayOne()
        {
            if (director == null || kyle == null || enemy == null) return;
            exchange += 1;
            bool kyleAttacks = exchange % 2 == 1;
            Limbus25DActor attacker = kyleAttacks ? kyle : enemy;
            Limbus25DActor defender = kyleAttacks ? enemy : kyle;
            int damage = rng.Next(damageRange.x, damageRange.y + 1);
            bool stagger = damage >= staggerAt;

            if (clashEvery > 0 && exchange % clashEvery == 0)
            {
                //맞부딪힘은 이긴 쪽이 친다. 가짜 계산이라 반반이다
                bool kyleWins = rng.Next(2) == 0;
                Limbus25DActor winner = kyleWins ? kyle : enemy;
                Limbus25DActor loser = kyleWins ? enemy : kyle;
                //가짜 위력. 실제로는 SPEC-007 §4.2 위력 비교 결과와 원인 문장이 어댑터에서 온다
                int winPower = rng.Next(12, 21);
                int losePower = rng.Next(6, winPower);
                director.Enqueue(PresentationCue.Clash(winner, loser, damage, stagger).WithCallouts(
                    new CueCallout(winner, true, $"위력 {winPower} > {losePower}"),
                    new CueCallout(loser, false, $"위력 열세 {losePower} < {winPower}")));
                return;
            }
            director.Enqueue(PresentationCue.OneSided(attacker, defender, damage, stagger).WithCallouts(
                new CueCallout(attacker, true, "")));
        }
    }
}
