"""
Отбор звуков библиотеки «на слух» через earshot (запускается из tools/.venv).

  python sfx_curate.py LIBRARY_DIR

1. В LIBRARY_DIR/<вид>/ уже лежат кандидаты из Openverse (настоящие записи).
2. Добавляем кандидатов, сделанных кодом (банк earshot: пролёты, попы, удары, нарастания, блеск) — es_*.wav.
3. earshot ранжирует всех кандидатов вида по словесному описанию нужного звука (CLAP, калиброванный z).
Печатает JSON: {вид: [{file, z, verdict, like}, ...]} — от лучшего к худшему.
"""
import json
import os
import sys

from earshot import api

# Что нужно в ролике: описание для ранжирования и кандидаты из банка earshot
KINDS = {
    'whoosh': ('a soft smooth airy whoosh for a scene transition in a clean motion graphics video',
               ['swipe/glide', 'swipe/velvet', 'swipe/cloth', 'swish/soft', 'swish/bright', 'whoosh_fast/sleeve', 'whoosh_fast/crisp', 'whoosh_fast/tight']),
    'pop': ('a soft clean rounded user interface pop for an item appearing on screen',
            ['pro_pop_in/airy', 'pro_pop_in/round', 'pro_pop_in/deep', 'ui_pop/soft', 'ui_pop/boop', 'pro_pop/boop', 'pro_pop/thup', 'pro_tap/soft', 'pro_tap/finger']),
    'hit': ('a deep warm cinematic impact for a logo reveal at the end of a video',
            ['pro_impact/deep', 'pro_impact/swell', 'cut_hit/sub', 'pro_logo_sting/sweep_hit']),
    'riser': ('a smooth airy cinematic riser building up to a logo reveal',
              ['riser/air', 'pro_riser/air_gate', 'reverse_swell/breath', 'riser/build']),
    'sparkle': ('a bright gentle magical shimmer sparkle for a logo appearing',
                ['pro_shimmer/m0', 'pro_shimmer/m2', 'logo_sting/soft_bloom', 'logo_sting/spark']),
}


def main(lib):
    out = {}
    for kind, (query, bank) in KINDS.items():
        d = os.path.join(lib, kind)
        os.makedirs(d, exist_ok=True)
        for sid in bank:
            f = os.path.join(d, 'es_' + sid.replace('/', '_') + '.wav')
            if not os.path.exists(f):
                try:
                    api.sfx_render(sid, f, seed=1)
                except Exception as e:  # звук банка не собрался — просто без него
                    print(f'earshot: {sid}: {e}', file=sys.stderr)
        files = sorted(os.path.join(d, x) for x in os.listdir(d) if x.endswith('.wav'))
        r = api.rank(files, query)
        out[kind] = [{'file': os.path.relpath(x['path'], lib), 'z': x['z'], 'verdict': x['verdict'], 'like': x['sounds_most_like']}
                     for x in r['results'] if not x['near_silent']]
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1])
