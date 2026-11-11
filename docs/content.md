# Content: explainer entries

`src/data/entries.json` — 52 entries, one per object/idea the player can look at.

`src/data/hints.json` — per entry `{sah,en,ru}`: where to look, for the journal finder (`docs/interactions.md`).

`src/data/images.json` — real reference images per entry id (42 entries, 72 images): `src` (`public/assets/ref/<id>-<n>.webp`, ≤1200 px), `w`, `h`, `caption{sah,en,ru}`, `credit`, `license`, `url`; credits in `docs/credits.md`. No image yet: baay-bayanay, mas-yagas, mogol-urasa, munkha, muus-tunnuk, ottuk-mas, sacred-birch, salama, tupte.

| Field | What |
|---|---|
| `id`, `category`, `related[]` | key, journal group (`CATS` in `src/ui/ui.js`), cross-links |
| `sah`, `translit`, `ru` | the term in Sakha, Latin, Russian |
| `title`, `short`, `body` | `{en, sah}` — card heading, one-liner, full text |
| `facts` | `{en: [], sah: []}` — same count and order in both languages |
| `sources[]`, `confidence`, `notes` | research trail; `notes` are English-only design guidance, not shown |

**The `sah` and `ru` texts are approved by the maintainer (2026-10-25).** Not yet approved: the 2026-10-29 additions from Олесова et al., «Якутские слова в русской речи» (2025): `choron` матаарчах, `dairy-cream` чабычах, `kymys` симиир, `khamyiakh-ladle` hollows, `oron` сандалы; the 2026-11-10 entry `tuu` and the work prompts and hints in `src/interact/work/*.js` (`TXT`, `list.js`) and `src/models/urasa.js` (`CHURN`), `tuos.js`, `gather.js`, `src/models/yardlife/smithy.js` (`TXT`; the three passes' names follow a 2023 school programme, medium confidence). Written by hand (no machine translation), terms checked in sakhatyla.ru and sah.wikipedia.org. Gloss words like «восток», «святцы», «строганина», «чернь» are kept in Russian on purpose.

## EN fixes made (factual)
- `kuruo` body, `khoton` fact: хаһаа and дал were swapped. sakhatyla: хаһаа = horse stall, дал = cattle pen by the khoton.
- `khamyiakh-ladle`: эбир хамыйах → ибиир хамыйах (ибиир= 'to sprinkle'; the entry's own fact already said ибиир).
- `urung-aar-toyon-aiyy`: Айыысыт → Айыыһыт (sah.wiki, sakhatyla айыыһыттаах).
- `osuokhai`: оһуохайы таһааччы → оһуохайы таһаарааччы (sah.wiki Оһуохай; sakhatyla also has оһуохайдьыт).
- `kytyya`: кырыыппа → кырыымпа (sakhatyla).
- `baay-bayanay`: саламат → саламаат (sakhatyla).
- `dairy-cream`: чохоон is butter whipped with warm milk and frozen, often with berries (sakhatyla), not 'butter with berries'.

## Terms with thin sources (kept; approved with the text)
| Entry | Word / phrase | Why unsure · alternatives · source |
|---|---|---|
| sayylyk-kystyk | кыштак | the Central Asian form, Kyrgyz spelling; EN has 'kyshtak' |
| oron | кэтэҕириин | sah.wiki spelling; sakhatyla has кэтэҕэриин |
| toyon-baghana | тойон баҕана | not found in the dictionary or sah.wiki; kept from the research |
| muus-tunnuk | кэнэҕиски (caul) | taken from sah.wiki Балаҕан; not in sakhatyla |
| khoton | сиэнилээх (with a porch) | loan from сени; my choice |
| urasa | туос лиистэрэ; «балык хатырыгын курдук» | my words for bark strips and the 'like roof tiles' simile |
| ampaar | үүт хоспоҕо | from Folkways; хоспох is in sah.wiki's list of yard buildings |
| homestead-layout | арҕаа = 'back' | sakhatyla: only dialectal ('диал. задняя сторона'); the Sakha text says so |
| choron, ornament | ornament names | described in plain words (сурааһын, кэрдиис, «уйа» харахтара), not as invented motif names |
| choron | хунну дойдутун алтан улахан иһиттэрэ | my phrasing for 'Xiongnu bronze cauldrons' |
| kytyya | кытыйа кырыымпа | not confirmed that this is the instrument's name |
| horsehair | кыл ситии | not found; sakhatyla: кыл = tail hair, сиэл = mane |
| kymys | өҥүрдэн | it is a verb ('to grow a slimy coat'), so the Sakha text has «өҥүрдэммит» |
| dairy-suorat-tar | «Тар — сыл аһа» | wording of the saying is mine |
| munkha | строганина, эбэҥки | Russian food word kept; Evenki = эбэҥки |
| blacksmith | Кудай Бахсы | sah.wiki spelling; EN has 'Kydai' — maybe change to 'Kudai' |
| blacksmith | «уус уонна ойуун биир уйаттан» | wording of the saying is not verified |
| silver-ornaments | кыабака (chains), көмүс киэргэл | the traditional word for women's ornaments is симэх; maybe use «көмүс симэх» |
| clothing | иис-куус, буобура (beaver), бууктаах | иис-куус not in sakhatyla; sah.wiki also gives бууттаах сон |
| uot-ichchite | салаа бытыктаах | my words for 'forked beard' |
| baay-bayanay | мэкчиргэ (owl), чорбохтоох (odd) | Russian–Sakha dictionary |
| salama | муоста (bridge) | my choice |
| olonkho | «илэ көстүбэт баай» | my wording for 'intangible heritage' |
| hospitality | «Кэпсээ!» / «Сонун суох» | sakhatyla confirms кэпсээ= as the usual greeting; the reply is mine |
| khomus | табыгыр | sah.wiki lists it as a newer technique; сыҥаах (the two arms) now replaces ойоҕос |
| saddle | халлаан токура (свод) | my phrasing; хоҥсуоччу is confirmed (sakhatyla) |
| sakha-calendar | эбэскэ | not found anywhere; бииринньик (not бииринньи) per sah.wiki's dialect list |
| oron | сандалы | Олесова et al. 2025: round on three legs (the card and the model); sakhatyla: eight-cornered or square |
| blacksmith | anvil 'treated with sour milk' | not used: the Jochelson passage may describe the Pamirs, not the Sakha |

Confirmed, no change needed: Аал Луук Мас, Аан Алахчын Хотун, Хатан Тэмиэрийэ, айыы аймаҕа, Эллэй Боотур (sah.wiki); хаппахчы, биллэрик, хабаҕал, холумтан, үөлэс, булгунньах, удьаа, көҕүөр, кырыыс, уруй, айхал, чэчир, түһүлгэ, аар баҕах, эбэ (lake euphemism) (sakhatyla). The `sah` term fields needed no fixes.

## Source pass 2026-11-10 (not yet approved)
Sources read: sah.wikipedia (API), sakhatyla.ru, Jochelson 1933, Bravina & Ivanova-Unarova 2020, Danilova 2014, Nikolaev 2023 / 2026; not reached: Seroshevsky 1896, Pekarsky.
- Fixed: `alaas` Мүрү 41 km round (was 80) · `muus-tunnuk` cow's afterbirth, кэнэҕэски (was calf's caul) · `kuruo` быар бүтэй gloss is one explanation · `birch-bark` оҥоойук, күҥкүр, туос ымыйа, лэппэйэ dropped, season June–July · `mas-yagas` 'many households' · `munkha`, `saddle` EN slips ('owner') · `clothing` дьабака fur band (sable, beaver, lynx) · `serge`, `ysyakh` аар баҕах (түһүлгэ is the festival ground) · `salama` саппай = short hair at the root of the tail · `sacred-birch` кэрэх removed (a blood sacrifice to evil spirits) · `baay-bayanay`, `algys` барыылаах = swift, eldest of nine spirits · `sakha-calendar` two halves counted 1–15 and 15–1, бииринньик · `khomus` сыҥаах · `knife` удьурҕай · `horse-and-cow` арыы.
- New facts (one or two each): `ohokh`, `sayylyk-kystyk`, `khoton`, `kytyya`, `khamyiakh-ladle`, `ygas-bucket`, `hay-making`, `tupte`, `horse-and-cow`, `blacksmith`, `serge`, `choron`, `dyedyen`, `munkha`, `hospitality`.
- Confidence raised to high where two independent sources agree (14 entries); `hay-making` to medium.

## UI label alternatives (current labels approved)
| Where | Now | Proposal |
|---|---|---|
| `CATS.animals` | Сүөһү | **Сүөһү-сылгы**: сүөһү is often cattle only, and the entry is about horses and cows |
| `CATS.household` | Тэрил | **Дьиэ тэрилэ** or **Иһит-хомуос** |
| `CATS.music` | Муусука | **Музыка** (current spelling) or **Ырыа-тойук** |
| `L.related` | Сибээстээх | fine; **Ситимнээх** is more native |
| `L.sources` | Сигэлэр | fine for URLs (сигэ = link); alternative: **Хантан ылыллыбыта** |
| index.html pause | Тохтобул | fine ('break, stop'); alternative: **Тохтотуу** |

Checked and correct: Дойду, Дьиэ-уот, Аһылык, Таҥас, Итэҕэл, Сиэр-туом, Бэлиэтээһин, булулунна, Бэлиэтээһиҥҥэ киирдэ, E / Esc — сап, Сахалыы, Саха сирэ.

## Russian (`ru`)
`title/short/body/facts.ru` in all entries and `ru` on in-world labels (`src/models/**`): written by hand from the EN, approved. Terms that had thin sources: кытыя (vs кытыйа), Иэйэхсит, Джёсёгёй Айыы, сымыыр (симир) for the kymys sack, хамнатар as «мутовка», тюптэ, «жердевые ворота» for сүрдьүгэс, Улла Йохансен, «серебро с водой» (уулаах көмүс).
- Орон: never «нары» (prison connotation). First use «орон — широкая лавка-лежанка», then «орон» (declined: орона, на ороне, ороны) or «лежанка»/«лавка» in labels.
- Балаган is «балаган», not «якутская юрта» or «изба»; хотон stays «хотон (хлев)». No «инородцы», «туземцы», «примитивный»; shamans plainly «шаман» (ойуун).
- Tone: museum guide, no English calques («читать дом» → «стороны дома называют»; feet → cm); questions to the player are impersonal («Какую ленточку повязать?»).
- Voice (all languages): Sakha-centred; «саха»/«народ саха»/"Sakha" for people and culture; «якутский» only for place, breeds (якутская лошадь/корова) and the trade term «якутский нож». No in-text citations (Wikipedia, Jochelson, Seroshevsky…) — sources live in `sources[]`; beliefs and living customs stated as held, in the present. Муус устар = April (sah.wikipedia «Муус устар»).

- `dyedyen` = small hand-picked wild strawberry (Fragaria vesca / F. viridis) gathered into birch-bark тууйас; оноойук and дьэдьэнньит (not in sakhatyla) replaced by тууйас and the verb дьэдьэннээ= (2026-10-24).
- Added `dyedyen` (food), `ottuk-mas` (household), `mas-yagas` (household; the carried water pail points here, `ygas-bucket` stays the birch-bark milk bucket). Rain idiom fixed to «ыаҕастаах уунан кутар» (sakhatyla).

## Actions rework 2026-11-11 (not yet approved)
- Controls list: the E row «Чугастык көр / оҥор» split into «Оҥор» (the do input), «Уур» (put down), «Чугастык көр» (E); same words as before, now three rows.
- Dropped with the E-only input: the "(E-ни тутан тур)" / "(hold E)" / «(удерживайте E)» variants of хайыт, тууну таһаар, оту оҕус, туоһу уокка сылыт, and the two E hints of the splitting job.
