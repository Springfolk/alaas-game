# Content: explainer entries

`src/data/entries.json` — 51 entries, one per object/idea the player can look at.

`src/data/hints.json` — per entry `{sah,en,ru}`: where to look, for the journal finder (`docs/interactions.md`).

`src/data/images.json` — real reference images per entry id (42 entries, 72 images): `src` (`public/assets/ref/<id>-<n>.webp`, ≤1200 px), `w`, `h`, `caption{sah,en,ru}`, `credit`, `license`, `url`; credits in `docs/credits.md`. No image yet: baay-bayanay, mas-yagas, mogol-urasa, munkha, muus-tunnuk, ottuk-mas, sacred-birch, salama, tupte.

| Field | What |
|---|---|
| `id`, `category`, `related[]` | key, journal group (`CATS` in `src/ui/ui.js`), cross-links |
| `sah`, `translit`, `ru` | the term in Sakha, Latin, Russian |
| `title`, `short`, `body` | `{en, sah}` — card heading, one-liner, full text |
| `facts` | `{en: [], sah: []}` — same count and order in both languages |
| `sources[]`, `confidence`, `notes` | research trail; `notes` are English-only design guidance, not shown |

**The `sah` and `ru` texts are approved by the maintainer (2026-10-25).** Written by hand (no machine translation), terms checked in sakhatyla.ru and sah.wikipedia.org. Gloss words like «восток», «святцы», «строганина», «чернь» are kept in Russian on purpose.

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
| alaas | халдьаайы | sakhatyla: the sunny slope on the north side, facing south; sah.wiki: «алаас хоту өттө». Written as «хоту өттө, күн көрөр сыыра» |
| alaas | Бороҕон | Sakha name for Borogontsy (sah.wiki Алаас) |
| sayylyk-kystyk | кыштак | the Central Asian form, Kyrgyz spelling; EN has 'kyshtak' |
| balagan | сис мас (матица) | sakhatyla gives өһүө = матица too; the entry uses өһүө for the top crossbeams (sah.wiki agrees) |
| oron | кэтэҕириин | sah.wiki spelling; sakhatyla has кэтэҕэриин |
| toyon-baghana | тойон баҕана | not found in the dictionary or sah.wiki; kept from the research |
| muus-tunnuk | кэнэҕиски (caul) | taken from sah.wiki Балаҕан; not in sakhatyla |
| khoton | сиэнилээх (with a porch) | loan from сени; my choice |
| urasa | туос лиистэрэ; «балык хатырыгын курдук» | my words for bark strips and the 'like roof tiles' simile |
| ampaar | үүт хоспоҕо | from Folkways; хоспох is in sah.wiki's list of yard buildings |
| kuruo | быар бүтэй, сиэлии бүтэй | from Nikolaev 2026; not checked in the dictionary |
| homestead-layout | арҕаа = 'back' | sakhatyla: only dialectal ('диал. задняя сторона'); the Sakha text says so |
| choron, ornament | ornament names | described in plain words (сурааһын, кэрдиис, «уйа» харахтара), not as invented motif names |
| choron | хунну дойдутун алтан улахан иһиттэрэ | my phrasing for 'Xiongnu bronze cauldrons' |
| kytyya | кытыйа кырыымпа | not confirmed that this is the instrument's name |
| birch-bark | ымыйа | sakhatyla: a large **wooden** bowl for kymys, not birch bark; the entry lists it as birch-bark ware |
| birch-bark | оноойук, кункур, лэппэйэ | not found in sakhatyla |
| ygas-bucket | «ыаҕастан кутар курдук» | the rain idiom was not found |
| horsehair | кыл ситии | not found; sakhatyla: кыл = tail hair, сиэл = mane |
| kymys | хамнатар | only the verb хамнат= is attested; starter written without a noun (бүрүө?) |
| kymys | өҥүрдэн | it is a verb ('to grow a slimy coat'), so the Sakha text has «өҥүрдэммит» |
| dairy-suorat-tar | «Тар — сыл аһа» | wording of the saying is mine |
| dairy-cream | күөрчэх ойуун | the toy name was not found |
| munkha | строганина, эбэҥки | Russian food word kept; Evenki = эбэҥки |
| khomus | ойоҕос (cheeks), кулуһун (reed khomus), табыгыр | cheek word is mine, no standard part name found; табыгыр not in sakhatyla |
| blacksmith | Кудай Бахсы | sah.wiki spelling; EN has 'Kydai' — maybe change to 'Kudai' |
| blacksmith | «уус уонна ойуун биир уйаттан» | wording of the saying is not verified |
| knife | хатыҥ ура (burl), кээнчэ (stocking) | ур = 'growth' (sakhatyla, Russian 'наплыв'); кээнчэ = fur stocking |
| saddle | халлаан токура (свод), хоҥсуоччу | first is my phrasing; хоҥсуоччу from sakhatyla «ыҥыыр хоҥ-суоччута» |
| silver-ornaments | кыабака (chains), көмүс киэргэл | the traditional word for women's ornaments is симэх; maybe use «көмүс симэх» |
| clothing | иис-куус, буобура (beaver), бууктаах | иис-куус not in sakhatyla; sah.wiki also gives бууттаах сон |
| uot-ichchite | салаа бытыктаах | my words for 'forked beard' |
| baay-bayanay | Баай Барыылаах = 'rich in everything' | sakhatyla: барыылаах = 'swift'; the epithet names the chief of the nine Байанай spirits. Not translated in the Sakha text |
| baay-bayanay | мэкчиргэ (owl), чорбохтоох (odd) | Russian–Sakha dictionary |
| salama | саппай = 'short mane hair' | sakhatyla: long hair at the end of the tail (or short hair at its base); the EN claim is doubtful |
| salama | муоста (bridge) | my choice |
| sacred-birch | кэрэх | sakhatyla: a sacrifice (to evil spirits), a sacrificial hide; doubtful for a gift at a sacred tree |
| olonkho | «илэ көстүбэт баай» | my wording for 'intangible heritage' |
| sakha-calendar | бииринньи, иккинньи, үһүнньү | only төрдүнньү and бэһинньи are attested (sah.wiki Архаизм, Балаҕан ыйа). атырдьах = pitchfork confirmed; эбэскэ not found |
| horse-and-cow | Дьыл оҕуһа | horn story confirmed in sah.wiki Олунньу |
| hospitality | «Кэпсээ!» / «Сонун суох» | sakhatyla confirms кэпсээ= as the usual greeting; the reply is mine |

Confirmed, no change needed: Аал Луук Мас, Аан Алахчын Хотун, Хатан Тэмиэрийэ, айыы аймаҕа, Эллэй Боотур (sah.wiki); хаппахчы, биллэрик, хабаҕал, холумтан, үөлэс, булгунньах, удьаа, көҕүөр, кырыыс, уруй, айхал, чэчир, түһүлгэ, аар баҕах, эбэ (lake euphemism) (sakhatyla). The `sah` term fields needed no fixes.

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
