# Avatar preset attribution

Thirty preset avatars (`add-user-profile`; expanded to thirty by
`diversify-avatar-preset-gallery`), all sourced from Wikimedia Commons and
individually license-checked at the time of sourcing (2026-08-02, expanded
2026-08-03, re-sourced 2026-08-04, expanded again 2026-08-18). Each image is
square-cropped from the original (crop region chosen manually per image)
and re-encoded; none are resold or used for any commercial endorsement,
and none depict a living person's likeness for a purpose implying their
endorsement.

**Current processing pipeline (2026-08-04):** every preset is a **plain
square crop, no background editing** — a source photo/painting/engraving
that already has a plain, light, or otherwise uncluttered background is
picked for each person, cropped directly to a centered square around the
head/shoulders, then:

1. **Grayscale, contrast-normalize, then blend 35% with a teal duotone**
   (`#0B2E2C` shadows → `#14B8A6` highlights, the app's own
   foreground/primary tokens) — unifies tone across photographs,
   paintings, and line art while keeping facial detail legible. A
   full-strength duotone was tried and rejected first — it washed
   portraits into a flat, muddy wash; 35% was the kept middle ground.

No AI background removal, no compositing onto a shared backdrop — each
avatar keeps its own source's natural (light) background tone, tinted
like everything else. This replaced an earlier `rembg`-based pipeline
(background removal + auto-crop-to-alpha-mask + composite onto one flat
`#F0F3F2` backdrop) that produced two classes of hard-to-spot defects on
several sources: a soft translucent "ghost" fringe where the model's
alpha mask stayed partially confident over dark clothing against a dark
background (`isaac-newton`, `albert-einstein`, `charles-darwin`,
`galileo-galilei`, `michael-faraday`, and the now-removed
`barbara-mcclintock`), and, on two full-body portraits (`charles-babbage`,
`hideyo-noguchi`), a bounding box computed from a nearly-full-frame noise
pattern that collapsed the auto-crop into a floating head with no
shoulders. Rather than keep chasing segmentation-model fixes, every
person whose *original* source photo had a busy, dark, or distracting
background (12 of the 23 at the time) was re-sourced to a different
Commons-hosted portrait — photo, painting, or engraving — of the same
person that has a plain/light background natively, so no editing is
needed at all. `barbara-mcclintock` is the one person for whom no such
alternative exists on Commons (see below) and was dropped from the
preset set rather than ship a bad cutout or a cluttered background.

This treatment applies **only** to the 22 curated presets — a user's own
uploaded photo (`add-custom-avatar-upload`) is never processed this way,
since it's a real photo of a real person and should look like them, not
a stylized illustration.

| Key | Subject | Source | License | Attribution required? |
|---|---|---|---|---|
| `ada-lovelace` | Ada Lovelace, watercolor by Alfred Edward Chalon, c. 1840 | [Commons](https://commons.wikimedia.org/wiki/File:Ada_Lovelace_portrait.jpg) | PD-old-100-expired / CC-PD-Mark | No |
| `alan-turing` | Alan Turing, aged 16, c. 1928 | [Commons](https://commons.wikimedia.org/wiki/File:Alan_Turing_Aged_16.jpg) | Public domain (life+70 expired; pre-1931 US publication) | No |
| `grace-hopper` | Grace Hopper, studio portrait, 1940s (re-sourced 2026-08-04 — the previous "USN, 1984" photo had a large American flag filling the background) | [Commons](https://commons.wikimedia.org/wiki/File:Grace_Hopper_in_the_1940s.webp) | Public domain (US, published without copyright renewal) | No |
| `marie-curie` | Marie Curie, 1911 Nobel Prize studio portrait, published in *Les Prix Nobel* 1912 (re-sourced 2026-08-04 — the previous c.1920 Manuel photo had a black background) | [Commons](https://commons.wikimedia.org/wiki/File:Marie_Curie_(Nobel-Chem).jpg) | Public domain (PD-Sweden / PD-old, CC-PD-Mark) | No |
| `charles-darwin` | Charles Darwin, studio photograph by Elliott & Fry, 1862–1882 (re-sourced 2026-08-04 — the previous Julia Margaret Cameron photo had a solid black background) | [Commons](https://commons.wikimedia.org/wiki/File:Charles_Darwin_by_Elliott_%26_Fry,_between_1862_to_1882.jpg) | CC-PD-Mark | No |
| `katherine-johnson` | Katherine Johnson, official NASA portrait, 1983 (re-sourced 2026-08-04 — the previous 1966 photo showed a busy office desk) | [Commons](https://commons.wikimedia.org/wiki/File:Katherine_Johnson_1983.jpg) | Public domain (NASA work — not copyrighted unless noted) | No |
| `isaac-newton` | Sir Isaac Newton, stipple engraving by John Scott after Kneller, 1795–1827, National Library of Wales (re-sourced 2026-08-04 — the previous Kneller painting had a dark, muddy background) | [Commons](https://commons.wikimedia.org/wiki/File:Portrait_of_Sir_Isaac_Newton_(4670222).jpg) | Public domain (life+100 expired), CC-PD-Mark | No |
| `albert-einstein` | Albert Einstein, 1947, photo by Oren Jack Turner (restoration-cleaned scan) (re-sourced 2026-08-04 — the previous 1921 photo had a solid black studio background) | [Commons](https://commons.wikimedia.org/wiki/File:Albert_Einstein_Head_cleaned.jpg) | Public domain (PD-US, published 1931–1963, copyright not renewed) | No |
| `nikola-tesla` | Nikola Tesla, c. 1890, photo by Napoleon Sarony | [Commons](https://commons.wikimedia.org/wiki/File:Tesla_circa_1890.jpeg) | CC-PD-Mark (pre-1931 US publication) | No |
| `mary-anning` | Mary Anning, posthumous painted portrait by Benjamin John Merifield Donne, based on an 1842 original, Geological Society of London (re-sourced 2026-08-04 — cropped tightly to the plain sky directly behind her head/bonnet; the previous painting's full beach/cliff scene was too busy at avatar scale) | [Commons](https://commons.wikimedia.org/wiki/File:Mary_Anning_by_B._J._Donne.jpg) | Public domain (PD-old, artist died 1928) | No |
| `john-von-neumann` | John von Neumann, Los Alamos identity badge photo | [Commons](https://commons.wikimedia.org/wiki/File:John_von_Neumann_Los_Alamos_identity_badge_photo.jpg) | PD LosAlamos | **Yes — credit "Los Alamos National Laboratory"** |
| `emmy-noether` | Emmy Noether, c. 1900, photographer unknown | [Commons](https://commons.wikimedia.org/wiki/File:Noether.jpg) | Public domain (anonymous work, expired under both German and US law) | No |
| `severo-ochoa` | Severo Ochoa, formal headshot, 1958, photo by Irwin Gooen (New York University) (re-sourced 2026-08-04 — the previous 1959 press photo showed a cluttered laboratory; this is the highest-resolution clean-background option Commons has for him, 328×449px, below the usual quality floor but workable at avatar scale) | [Commons](https://commons.wikimedia.org/wiki/File:Severo_Ochoa_1958.jpg) | Public domain (published in the US 1931–1977 without a copyright notice) | No |
| `richard-feynman` | Richard Feynman, Los Alamos identity badge photo (Nobel laureate, Physics 1965) | [Commons](https://commons.wikimedia.org/wiki/File:Richard_P._Feynman_Los_Alamos_ID_badge_photo.jpg) | PD LosAlamos | **Yes — credit "Los Alamos National Laboratory"** |
| `leonardo-da-vinci` | Leonardo da Vinci, line engraving by George Cooke, after Horenout | [Commons](https://commons.wikimedia.org/wiki/File:Leonardo_da_Vinci._Line_engraving_by_G._Cooke._Wellcome_V0006064.jpg) | CC BY 4.0 (Wellcome Collection) | **Yes — credit Wellcome Collection** |
| `archimedes` | Archimedes, engraving by an unknown artist, c. 1584, from André Thevet's *Les vrais pourtraits...* | [Commons](https://commons.wikimedia.org/wiki/File:Archimedes1.jpg) | Public Domain Mark 1.0 | No |
| `charles-babbage` | Charles Babbage, stipple engraving by Roffe, 1833, "by permission from an original family painting," Wellcome Collection (re-sourced 2026-08-04 — the previous 1860 photo had a dark studio backdrop) | [Commons](https://commons.wikimedia.org/wiki/File:Charles_Babbage._Stipple_engraving_by_Roffe,_1833._Wellcome_V0000258.jpg) | CC BY 4.0 (Wellcome Collection) | **Yes — credit Wellcome Collection** |
| `galileo-galilei` | Galileo Galilei, 1837 copper engraving by Caterina Piotti Pirola, after the Sustermans portrait (re-sourced 2026-08-04 — the previous Sustermans painting itself had a dark background) | [Commons](https://commons.wikimedia.org/wiki/File:Galileo_Galilei._Cat._Piotti-Pirola_sculp.jpg) | CC0 1.0 | No |
| `michael-faraday` | Michael Faraday, engraved frontispiece, 1870, from Henry Bence Jones's *The Life and Letters of Faraday* (re-sourced 2026-08-04 — the previous Pickersgill painting had a dark brown background) | [Commons](https://commons.wikimedia.org/wiki/File:The_Life_and_Letters_of_Faraday,_Volume_I._-_Frontispiece.png) | Public domain (PD-US, published pre-1931) | No |
| `srinivasa-ramanujan` | Srinivasa Ramanujan, photograph, Oberwolfach Photo Collection, photographer Konrad Jacobs | [Commons](https://commons.wikimedia.org/wiki/File:Srinivasa_Ramanujan_-_OPC_-_2_(cleaned).jpg) | PD-India / PD-1923 | No |
| `hideyo-noguchi` | Hideyo Noguchi, photograph, before 1928, from a Japanese biography (National Diet Library digitization) | [Commons](https://commons.wikimedia.org/wiki/File:Dr._Noguchi_Hideyo.jpg) | PD-Japan-oldphoto | No |
| `confucius` | Confucius, album leaf, anonymous artist, Yuan dynasty (1279–1368), National Palace Museum, Taipei — "Half Portraits of the Great Sage and Virtuous Men of Old" | [Commons](https://commons.wikimedia.org/wiki/File:Half_Portraits_of_the_Great_Sage_and_Virtuous_Men_of_Old_-_Confucius.jpg) | PD-1923 | No |
| `hypatia` | Hypatia, wood engraving, mid-19th century (imagined likeness — no contemporary depiction exists, same caveat as `archimedes`/`leonardo-da-vinci` below) | [Commons](https://commons.wikimedia.org/wiki/File:Hypatia_-_mid_19th_century_engraving.jpg) | CC-PD-Mark | No |
| `sophie-germain` | Sophie Germain, engraved bust portrait, from *Œuvres philosophiques*, 1896 | [Commons](https://commons.wikimedia.org/wiki/File:Germain_-_Œuvres_philosophiques,_1896_(Illustration_page_4).jpg) | CC-PD-Mark / PD-old | No |
| `caroline-herschel` | Caroline Herschel, aged 92, stipple engraving by Joseph Brown, frontispiece to her 1876 memoir | [Commons](https://commons.wikimedia.org/wiki/File:Caroline_Herschel-1876-Memoir-frontispiece.jpeg) | PD-old-100 / CC-PD-Mark | No |
| `mary-somerville` | Mary Somerville, wood engraving, *Illustrated London News*, 1872, Library of Congress | [Commons](https://commons.wikimedia.org/wiki/File:Mary_Fairfax_Somerville,_1780-1872,_bust_portrait,_facing_left_LCCN2005691459.jpg) | CC-PD-Mark / PD-old | No |
| `henrietta-swan-leavitt` | Henrietta Swan Leavitt, studio photograph, c. 1898, Library of Congress | [Commons](https://commons.wikimedia.org/wiki/File:Henrietta_Swan_Leavitt.jpg) | Public domain (pre-1931 publication) | No |
| `nettie-stevens` | Nettie Stevens, studio portrait, c. 1904, Bryn Mawr College Archives (Adam Cuerden restoration; Commons featured picture) | [Commons](https://commons.wikimedia.org/wiki/File:Nettie_Maria_Stevens_(cropped).jpg) | PD-1923 | No |
| `lise-meitner` | Lise Meitner, 1953, USIS photo, Austrian National Library holding | [Commons](https://commons.wikimedia.org/wiki/File:Lise_Meitner_(1878–1968)_1953_OeNB_USIS_2955727.jpg) | Public domain (US federal government work) | No |
| `agnes-pockels` | Agnes Pockels, painted portrait, artist unknown, c. 1892 | [Commons](https://commons.wikimedia.org/wiki/File:Agnes_Pockels_ca1892.jpg) | Public domain (CC-PD-Mark, PD-old, anonymous author) | No |

Two notes on authenticity, not licensing (both images are unambiguously
clean to use): the `archimedes` and `leonardo-da-vinci` images are both
later engravings, not portraits made from life — Archimedes died c.
1,800 years before his engraving was made, and the Cooke engraving of
da Vinci is an 18th/19th-century print, not a contemporary likeness.
This is normal for how historical/classical figures are depicted in
absence of a photograph, and true of essentially every available image
of either man. The same is now also true of several other 2026-08-04
re-sourced images (`isaac-newton`, `charles-babbage`, `galileo-galilei`,
`michael-faraday` are all period engravings/prints rather than
photographs) — a plain-background engraving was consistently easier to
find than a plain-background painting or photograph for pre-photographic
subjects.

`leonardo-da-vinci` was originally sourced as a red-chalk drawing
traditionally (and disputedly) called a self-portrait
([Leonardo_self.jpg](https://commons.wikimedia.org/wiki/File:Leonardo_self.jpg),
still clean to use license-wise) — re-sourced to the Cooke engraving
above on 2026-08-03 because the drawing's low contrast against its paper
made automated background removal fail outright on every model tried
(a moot concern now that no preset uses background removal, but the
Cooke engraving remains the better choice on its own merits: a genuinely
plain background, no re-sourcing needed).

`barbara-mcclintock` was **removed from the preset set (2026-08-04)**
after a full search of her Commons category (21 files) turned up nothing
usable: the two well-known Bernard Gotfryd/LOC lab portraits both have a
striped wall background with a visible cast shadow and archival crop
marks; a 1910s family photo is low-quality with another person's
shoulder in frame; a Nobel-lecture photo has her too small/distant to
crop; one candidate that initially looked promising
(`Barbara_McClintock,_2011.jpg`) turned out on inspection to depict an
unrelated living person who happens to share her name, not the
geneticist. Rather than force a cluttered background or a
dubiously-attributed photo into the set, she was dropped. Worth
revisiting if the NLM's 1983 "Profiles in Science" portrait (referenced
in NLM's own materials but not currently hosted on Commons) is ever
uploaded there.

Originally considered and **rejected**: Rosalind Franklin — her
best-known photographs have unclear/disputed copyright status (the
National Portrait Gallery manages licensing for portraits of her, and
ownership of the DNA photograph specifically is undocumented); not
worth the exposure for a redistributed open-source app. Emmy Noether
substituted instead. Rita Levi-Montalcini (Nobel laureate, Physiology
or Medicine 1986) was also considered when expanding into Nobel
laureates — her available Commons photo requires attribution to the
Italian Presidency ("Quirinale.it") and that license was revoked for
any file published after 2024-09-10; excluded to avoid a second,
differently-sourced attribution obligation on top of the one
`john-von-neumann`/`richard-feynman` already carry. Worth adding later
if there's appetite for the extra credit-line bookkeeping.

Originally considered and **rejected** (`diversify-avatar-preset-gallery`,
2026-08-18, expanding the roster to address issue #125's gender skew):
**Dorothy Hodgkin** — every real photograph in her Commons category (36
files checked) has a busy background (a wood-paneled door with a visible
handle, in the two most commonly used ones), shows other people, or is a
medal/insignia close-up rather than a photo of her; the one
clean-background alternative is a 2021 digital illustration by a living
artist, stylistically inconsistent with this roster's period-photo/
painting/engraving convention. **Agnes Pockels** substituted instead.
**Chien-Shiung Wu** — her one well-composed candidate (a 1930s university
student portrait) has unresolved US public-domain status (a China-PD tag
only, no confirmed US tag, and too vague a date to confirm the pre-1931
US cutoff) — the same class of problem that sank Rosalind Franklin above,
not worth the exposure. Two further physics candidates were tried in her
place and also rejected: **Marietta Blau** has no photograph on Commons
at all (only modern illustrations and a commemorative-plaque photo);
**Katharine Burr Blodgett**'s only Commons photo (a 1938 GE publicity
shot) has her flanked by lab apparatus, bottles, and cabinets on both
sides; **Cecilia Payne-Gaposchkin** has 15 files in her category (8 of
them actual photographs), every one either a busy background (a stone
building wall, a file-cabinet-lined office, a home interior with a china
cabinet) or a modern photographer's stylistically-inconsistent portrait.
No replacement was found for the physics slot after two research rounds
(5 names total); the roster ships with 8 new presets instead of the
originally-targeted 9, 14 women of 30 total rather than 15 of 31 — see
`openspec/changes/archive/*-diversify-avatar-preset-gallery/design.md`
for the full research trail if this is ever revisited.

**Four images require an in-app attribution credit, not yet added**:
`john-von-neumann` and `richard-feynman` (both "PD LosAlamos" — Los
Alamos National Laboratory's own terms ask for a credit, even though
the images are otherwise free to use for any purpose), and
`leonardo-da-vinci` and `charles-babbage` (both CC BY 4.0, Wellcome
Collection — legally requires a credit, not just a courtesy). None of
the four is currently displayed anywhere in the running app; if these
stay in the preset set, add credit lines ("Photo: Los Alamos National
Laboratory"; "Engraving: Wellcome Collection, CC BY 4.0") somewhere
reachable (e.g. a Settings/About page) to satisfy those conditions
honestly.

Each master image (`assets/avatars/<key>.jpg`, 512×512) and its
128×128 web copy (`apps/web/src/assets/avatars/<key>.jpg`) is a plain
square crop (manually chosen region per subject, no background editing)
run through the grayscale/contrast/teal-duotone tint described above.
