# Content: explainer entries

- `src/data/entries.json`: 52 entries, one per thing or idea the player can look at.
- `src/data/images.json`: reference images for 42 entries (72 images): `src` (`public/assets/ref/<id>-<n>.webp`, ≤1200 px), `w`, `h`, `caption{sah,en,ru}`, `credit`, `license`, `url`; credits in `docs/credits.md`. None yet: baay-bayanay, mas-yagas, mogol-urasa, munkha, muus-tunnuk, ottuk-mas, sacred-birch, salama, tupte, tuu.
- An entry's saying on the stage: `say` in `src/data/views.json` (`docs/ui.md`).

| Field | What |
|---|---|
| `id`, `category`, `related[]` | key, journal group (`CATS` in `src/ui/ui.js`), cross-links |
| `sah`, `translit`, `ru` | the term in Sakha, Latin, Russian |
| `title`, `short`, `body` | `{en, sah, ru}`: heading, one-liner, full text |
| `facts` | `{en: [], sah: [], ru: []}`: same count and order in every language |
| `sources[]`, `confidence`, `notes` | research trail (`confidence` high/medium/low); `notes` = English design guidance, never shown |

## Language and voice
- Sakha and Russian are written by hand (no machine translation); terms checked in sakhatyla.ru and sah.wikipedia.org (`docs/terms.md`). Russian is written from the EN.
- Sakha-centred: «саха» / «народ саха» / "Sakha" for people and culture; «якутский» only for places, breeds (якутская лошадь/корова) and the trade term «якутский нож».
- No in-text citations (Wikipedia, Jochelson, Seroshevsky…): sources live in `sources[]`. Beliefs and living customs are stated as held, in the present.
- Russian tone: a museum guide, no English calques («стороны дома называют», not «читать дом»; cm, not feet); questions to the player impersonal («Какую ленточку повязать?»).
- Орон: never «нары»; first use «орон — широкая лавка-лежанка», then «орон» (орона, на ороне, ороны) or «лежанка»/«лавка» in labels.
- Балаган is «балаган», not «якутская юрта» or «изба»; хотон is «хотон (хлев)». No «инородцы», «туземцы», «примитивный»; a shaman is «шаман» (ойуун).
- Russian glosses «восток», «святцы», «строганина», «чернь» stay Russian on purpose.
- Муус устар = April (sah.wikipedia «Муус устар»).
- `dyedyen` = small hand-picked wild strawberry (Fragaria vesca / F. viridis) gathered into a birch-bark тууйас; verb дьэдьэннээ=. `mas-yagas` = the carried wooden water pail; `ygas-bucket` = the birch-bark milk bucket. Rain idiom «ыаҕастаах уунан кутар» (sakhatyla).

## Approval
Approved by the maintainer: the entries' `sah` and `ru` texts, the interface labels, the stage sayings (`say`, with «Уокка · Сиргэ · Халлааҥҥа»). Not yet approved:
- From Олесова et al., «Якутские слова в русской речи» (2025): `choron` матаарчах, `dairy-cream` чабычах, `kymys` симиир, `khamyiakh-ladle` hollows, `oron` сандалы.
- The entry `tuu`.
- Work prompts, hints and sayings: `src/interact/work/*.js` (`TXT`), `work/list.js`, the `churn` act in `src/models/urasa.js`, `src/models/yardlife/smithy.js` `TXT` (the three passes' names follow a 2023 school programme: medium confidence).
- Controls rows «Оҥор» (do), «Уур» (put down), «Чугастык көр» (E).
- Settings row «Скорость обзора» ("Look speed"; Sakha unchanged); the start button's "tap to walk" on a phone (English only).
- Journal leaves «Хаарта» (Map, «Карта»), «Булумньу» (Finds, «Находки»), «Үлэ» (Work, «Работа»).
- Act labels: дьэдьэн "pick berries" / «собрать ягоды»; gate "draw the gate rails"; pail «ууну кут» ("pour the water out", «вылить воду»); «төттөрү уур» ("put it back", «вернуть на место»); «ыалдьыт чорооно», «кымыста кут», «ыс эбэтэр ис», «үүттээх туос иһит», «үүтү ыл»; forge passes «уһугун тарт», «хаптат», «биитин таптай» («оттянуть остриё», «расплющить», «проковать лезвие»).
- Source-pass facts (sah.wikipedia, sakhatyla.ru, Jochelson 1933, Bravina & Ivanova-Unarova 2020, Danilova 2014, Nikolaev 2023 / 2026): `alaas` Мүрү ~41 km round · `muus-tunnuk` a cow's afterbirth, кэнэҕэски · `kuruo` the быар бүтэй gloss as one explanation · `birch-bark` items, season June–July · `mas-yagas` 'many households' · `munkha`, `saddle` EN wording · `clothing` дьабака fur band (sable, beaver, lynx) · `serge`, `ysyakh` аар баҕах (түһүлгэ = the festival ground) · `salama` саппай = short hair at the root of the tail · `sacred-birch` without кэрэх (a blood sacrifice to evil spirits) · `baay-bayanay`, `algys` барыылаах = swift, eldest of nine spirits · `sakha-calendar` two halves counted 1–15 and 15–1, бииринньик · `khomus` сыҥаах · `knife` удьурҕай · `horse-and-cow` арыы. New facts in `ohokh`, `sayylyk-kystyk`, `khoton`, `kytyya`, `khamyiakh-ladle`, `ygas-bucket`, `hay-making`, `tupte`, `horse-and-cow`, `blacksmith`, `serge`, `choron`, `dyedyen`, `munkha`, `hospitality`; `confidence` high in 14 entries where two independent sources agree, `hay-making` medium. Not yet read: Seroshevsky 1896, Pekarsky.
