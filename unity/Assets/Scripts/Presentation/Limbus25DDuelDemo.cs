using System.Threading.Tasks;
using UnityEngine;

namespace EndDistopirism.Presentation
{
    //카일 1대1 시험 무대. 전투 계산 자리에 아주 작은 가짜 계산을 두고, 결과만 연출 감독에 넘긴다 (SPEC-005 §8.1)
    //실제 전투에서는 도메인 이벤트를 PresentationCue 로 바꾸는 어댑터가 이 자리를 대신한다 (웹 render/exchange.ts)
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
        [Tooltip("일방 공격이 빗나갈(피해 0) 확률")]
        [Range(0f, 1f)] [SerializeField] private float missChance = 0.15f;
        [Tooltip("체력. 0 이 되면 쓰러지고 잠시 뒤 새 판을 연다 (SPEC-001 §7 [D-22] 카일 96 · 걸음 잔형 110)")]
        [SerializeField] private int kyleHp = 96;
        [SerializeField] private int enemyHp = 110;
        [Tooltip("몇 번째 교전마다 맞부딪힘으로 할지")]
        [SerializeField] private int clashEvery = 3;
        [Tooltip("맞부딪힘 한 건의 최대 라운드 수")]
        [SerializeField] private int maxRounds = 3;
        [SerializeField] private float pauseBetween = 0.45f;
        [Tooltip("한 판이 끝나고 새 판을 열 때까지")]
        [SerializeField] private float pauseAfterBattle = 1.6f;
        [SerializeField] private bool autoPlay = true;

        private System.Random rng;
        private int exchange;
        private bool looping;
        private int kyleLeft;
        private int enemyLeft;

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
            NewBattle();
            if (autoPlay) _ = LoopAsync();
        }

        private void OnDisable()
        {
            looping = false;
        }

        //체력을 채우고 둘을 다시 세운다
        private void NewBattle()
        {
            kyleLeft = kyleHp;
            enemyLeft = enemyHp;
            exchange = 0;
            kyle.ResetForBattle();
            enemy.ResetForBattle();
        }

        //교전을 하나씩 계산해 넘기고, 연출이 끝나면 잠깐 쉬고 다음을 넘긴다. 누가 쓰러지면 새 판
        private async Task LoopAsync()
        {
            looping = true;
            while (looping && isActiveAndEnabled)
            {
                PlayOne();
                while (looping && director != null && director.IsBusy) await Task.Yield();
                bool over = kyleLeft <= 0 || enemyLeft <= 0;
                float until = Time.unscaledTime + (over ? pauseAfterBattle : pauseBetween);
                while (looping && Time.unscaledTime < until) await Task.Yield();
                if (over && looping) NewBattle();
            }
        }

        //교전 한 건을 계산해 넘긴다. 버튼에 물려 수동으로도 쓴다
        public void PlayOne()
        {
            if (director == null || kyle == null || enemy == null) return;
            if (kyleLeft <= 0 || enemyLeft <= 0) return;
            exchange += 1;
            SkillSlot kyleSlot = (SkillSlot)(1 + (exchange - 1) % 3);
            int damage = rng.Next(damageRange.x, damageRange.y + 1);

            if (clashEvery > 0 && exchange % clashEvery == 0)
            {
                director.Enqueue(FakeClash(damage, kyleSlot));
                return;
            }

            bool kyleAttacks = exchange % 2 == 1;
            Limbus25DActor attacker = kyleAttacks ? kyle : enemy;
            Limbus25DActor defender = kyleAttacks ? enemy : kyle;
            if (rng.NextDouble() < missChance) damage = 0;
            bool defeated = Hit(defender, damage);
            //빗나가면 코인 앞면이 하나도 안 나온 것이다 (웹 exchange.ts 알림 문구)
            CueCallout note = damage > 0 ? new CueCallout(attacker, true, $"피해 {damage}", "공격 성공") : new CueCallout(attacker, false, "코인 앞면 0", "빗나감");
            director.Enqueue(PresentationCue.OneSided(attacker, defender, damage)
                .WithSlots(kyleAttacks ? kyleSlot : SkillSlot.S1)
                .WithDefeat(defeated)
                .WithCallouts(note));
        }

        //체력을 깎고 쓰러졌는지 돌려준다
        private bool Hit(Limbus25DActor target, int damage)
        {
            if (target == kyle) { kyleLeft -= damage; return kyleLeft <= 0; }
            enemyLeft -= damage;
            return enemyLeft <= 0;
        }

        //가짜 맞부딪힘. 라운드 1~maxRounds 번, 가끔 교착이 끼고 마지막 라운드에서 이긴 쪽이 친다
        //실제로는 도메인 이벤트(clashRoundWin·deadlock)와 위력 값이 어댑터에서 온다 (SPEC-005 §9.2)
        private PresentationCue FakeClash(int damage, SkillSlot kyleSlot)
        {
            int count = rng.Next(1, Mathf.Max(1, maxRounds) + 1);
            var rounds = new CueRound[count];
            Limbus25DActor last = null;
            for (int i = 0; i < count; i++)
            {
                bool final = i == count - 1;
                if (!final && rng.Next(3) == 0)
                {
                    int tie = rng.Next(8, 18);
                    rounds[i] = CueRound.Deadlock(new CueCallout(kyle, false, $"위력 {tie} = {tie}", "교착"));
                    continue;
                }
                bool kyleWins = rng.Next(2) == 0;
                Limbus25DActor winner = kyleWins ? kyle : enemy;
                Limbus25DActor loser = kyleWins ? enemy : kyle;
                int winPower = rng.Next(12, 21);
                int losePower = rng.Next(6, winPower);
                rounds[i] = CueRound.Win(winner, loser,
                    kyleWins
                        ? new CueCallout(kyle, true, $"위력 {winPower} > {losePower}", "합 승리")
                        : new CueCallout(kyle, false, $"위력 열세 {losePower} < {winPower}", "합 패배"));
                last = winner;
            }
            bool defeated = Hit(last == kyle ? enemy : kyle, damage);
            return PresentationCue.ClashRounds(kyle, enemy, rounds, last, damage)
                .WithSlots(kyleSlot, SkillSlot.S1)
                .WithDefeat(defeated);
        }
    }
}
