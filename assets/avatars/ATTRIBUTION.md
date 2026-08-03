# Avatar preset attribution

Twenty-three preset avatars (`add-user-profile`), all sourced from Wikimedia
Commons and individually license-checked at the time of sourcing
(2026-08-02, expanded 2026-08-03). Each image is square-cropped from
the original (crop region chosen manually per image, see below) and
re-encoded; none are resold or used for any commercial endorsement, and
none depict a living person's likeness for a purpose implying their
endorsement.

**Uniform processing pipeline (2026-08-03, Pepe design review, extended
same day after background-removal follow-up):** every preset goes
through the same four-step pass, not per-image editing:

1. **Background removal** (`rembg`, `isnet-general-use` model) isolates
   the subject from whatever the original photo/painting/engraving's
   background was — a mix of studio backdrops, painted dark backgrounds,
   flags, aged paper, and plain walls that clashed badly with each other
   at 40px.
2. **Auto-crop to the subject** — the alpha mask's bounding box (+10%
   padding), padded to a centered square. This also fixed several
   sources whose original manual crop had the face too small or too
   close to an edge (`mary-anning`, `severo-ochoa`, `barbara-mcclintock`)
   without needing a full recrop-by-hand pass.
3. **Composite onto one flat backdrop** (`#F0F3F2`, the app's own
   `--muted` token) — every preset now sits on the *same* background,
   not 23 different ones.
4. **Grayscale, contrast-normalize, then blend 35% with a teal duotone**
   (`#0B2E2C` shadows → `#14B8A6` highlights, the app's own
   foreground/primary tokens) — unifies tone across photographs,
   paintings, and line art while keeping facial detail legible. A
   full-strength duotone was tried and rejected first — it washed
   portraits into a flat, muddy wash; 35% was the kept middle ground.

This treatment applies **only** to the 23 curated presets — a user's own
uploaded photo (`add-custom-avatar-upload`) is never processed this way,
since it's a real photo of a real person and should look like them, not
a stylized illustration.

Background removal is imperfect on some source material — anything with
low contrast between subject and background (a faint pencil/chalk
drawing on similarly-toned paper) fails outright rather than producing a
mediocre result; see `leonardo-da-vinci` below, which was re-sourced
from a different, higher-contrast original for exactly this reason
rather than shipped with a bad cutout.

| Key | Subject | Source | License | Attribution required? |
|---|---|---|---|---|
| `ada-lovelace` | Ada Lovelace, watercolor by Alfred Edward Chalon, c. 1840 | [Commons](https://commons.wikimedia.org/wiki/File:Ada_Lovelace_portrait.jpg) | PD-old-100-expired / CC-PD-Mark | No |
| `alan-turing` | Alan Turing, aged 16, c. 1928 | [Commons](https://commons.wikimedia.org/wiki/File:Alan_Turing_Aged_16.jpg) | Public domain (life+70 expired; pre-1931 US publication) | No |
| `grace-hopper` | Commodore Grace M. Hopper, USN, 1984, photo by James S. Davis | [Commons](https://commons.wikimedia.org/wiki/File:Commodore_Grace_M._Hopper,_USN_(covered).jpg) | Public domain (U.S. federal government work — U.S. Navy) | No |
| `marie-curie` | Marie Curie, c. 1920, photo by Henri Manuel | [Commons](https://commons.wikimedia.org/wiki/File:Marie_Curie_c1920.png) | Public domain (author died 1947; pre-1931 US publication) | No |
| `charles-darwin` | Charles Darwin, 1869, photo by Julia Margaret Cameron | [Commons](https://commons.wikimedia.org/wiki/File:Charles_Darwin_01.jpg) | CC-PD-Mark | No |
| `katherine-johnson` | Katherine Johnson at NASA, 1966 | [Commons](https://commons.wikimedia.org/wiki/File:Katherine_Johnson_at_NASA,_in_1966.jpg) | Public domain (NASA work — not copyrighted unless noted) | No |
| `isaac-newton` | Sir Isaac Newton, 1689, painting by Godfrey Kneller (copy by James Thornhill) | [Commons](https://commons.wikimedia.org/wiki/File:GodfreyKneller-IsaacNewton-1689.jpg) | PD-Art (PD-old-100-expired) | No |
| `albert-einstein` | Albert Einstein, 1921 | [Commons](https://commons.wikimedia.org/wiki/File:Albert_Einstein_photo_1921.jpg) | Public domain (Library of Congress — no known restrictions) | No |
| `nikola-tesla` | Nikola Tesla, c. 1890, photo by Napoleon Sarony | [Commons](https://commons.wikimedia.org/wiki/File:Tesla_circa_1890.jpeg) | CC-PD-Mark (pre-1931 US publication) | No |
| `mary-anning` | Mary Anning with her dog Tray, painting by unknown artist, before 1842 | [Commons](https://commons.wikimedia.org/wiki/File:Mary_Anning_painting.jpg) | CC-PD-Mark (life+70 expired) | No |
| `john-von-neumann` | John von Neumann, Los Alamos identity badge photo | [Commons](https://commons.wikimedia.org/wiki/File:John_von_Neumann_Los_Alamos_identity_badge_photo.jpg) | PD LosAlamos | **Yes — credit "Los Alamos National Laboratory"** |
| `emmy-noether` | Emmy Noether, c. 1900, photographer unknown | [Commons](https://commons.wikimedia.org/wiki/File:Noether.jpg) | Public domain (anonymous work, expired under both German and US law) | No |
| `severo-ochoa` | Severo Ochoa, 1959 press photo (Nobel laureate, Physiology or Medicine 1959) | [Commons](https://commons.wikimedia.org/wiki/File:Severo_Ochoa_1959.jpg) | Public domain (PD-US-no-notice, published 1931–1977 without a copyright notice) | No |
| `barbara-mcclintock` | Barbara McClintock in her laboratory, 1947 (Nobel laureate, Physiology or Medicine 1983) | [Commons](https://en.wikipedia.org/wiki/File:Barbara_McClintock_(1902-1992)_shown_in_her_laboratory_in_1947.jpg) | Public domain (Smithsonian Institution Archives — no known copyright restrictions) | No |
| `richard-feynman` | Richard Feynman, Los Alamos identity badge photo (Nobel laureate, Physics 1965) | [Commons](https://commons.wikimedia.org/wiki/File:Richard_P._Feynman_Los_Alamos_ID_badge_photo.jpg) | PD LosAlamos | **Yes — credit "Los Alamos National Laboratory"** |
| `leonardo-da-vinci` | Leonardo da Vinci, line engraving by George Cooke, after Horenout | [Commons](https://commons.wikimedia.org/wiki/File:Leonardo_da_Vinci._Line_engraving_by_G._Cooke._Wellcome_V0006064.jpg) | CC BY 4.0 (Wellcome Collection) | **Yes — credit Wellcome Collection** |
| `archimedes` | Archimedes, engraving by an unknown artist, c. 1584, from André Thevet's *Les vrais pourtraits...* | [Commons](https://commons.wikimedia.org/wiki/File:Archimedes1.jpg) | Public Domain Mark 1.0 | No |
| `charles-babbage` | Charles Babbage, photograph, 1860, photographer unknown | [Commons](https://commons.wikimedia.org/wiki/File:Charles_Babbage_-_1860.jpg) | Public domain (life+70 expired) | No |
| `galileo-galilei` | Galileo Galilei, painting by Justus Sustermans, 1635 (Uffizi Gallery) | [Commons](https://commons.wikimedia.org/wiki/File:Justus_Sustermans_-_Portrait_of_Galileo_Galilei_(Uffizi).jpg) | Public Domain Mark 1.0 (life+100 expired) | No |
| `michael-faraday` | Michael Faraday, painting by Henry William Pickersgill, c. 1826 | [Commons](https://commons.wikimedia.org/wiki/File:Michael_Faraday_(1791-1867).jpg) | CC0 1.0 | No |
| `srinivasa-ramanujan` | Srinivasa Ramanujan, photograph, Oberwolfach Photo Collection, photographer Konrad Jacobs | [Commons](https://commons.wikimedia.org/wiki/File:Srinivasa_Ramanujan_-_OPC_-_2_(cleaned).jpg) | PD-India / PD-1923 | No |
| `hideyo-noguchi` | Hideyo Noguchi, photograph, before 1928, from a Japanese biography (National Diet Library digitization) | [Commons](https://commons.wikimedia.org/wiki/File:Dr._Noguchi_Hideyo.jpg) | PD-Japan-oldphoto | No |
| `confucius` | Confucius, album leaf, anonymous artist, Yuan dynasty (1279–1368), National Palace Museum, Taipei — "Half Portraits of the Great Sage and Virtuous Men of Old" | [Commons](https://commons.wikimedia.org/wiki/File:Half_Portraits_of_the_Great_Sage_and_Virtuous_Men_of_Old_-_Confucius.jpg) | PD-1923 | No |

Two notes on authenticity, not licensing (both images are unambiguously
clean to use): the `archimedes` and `leonardo-da-vinci` images are both
later engravings, not portraits made from life — Archimedes died c.
1,800 years before his engraving was made, and the Cooke engraving of
da Vinci is an 18th/19th-century print, not a contemporary likeness.
This is normal for how historical/classical figures are depicted in
absence of a photograph, and true of essentially every available image
of either man.

`leonardo-da-vinci` was originally sourced as a red-chalk drawing
traditionally (and disputedly) called a self-portrait
([Leonardo_self.jpg](https://commons.wikimedia.org/wiki/File:Leonardo_self.jpg),
still clean to use license-wise) — re-sourced to the Cooke engraving
above during the background-removal pass because the drawing's low
contrast against its paper made automated background removal fail
outright on every model tried.

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

**Three images require an in-app attribution credit, not yet added**:
`john-von-neumann` and `richard-feynman` (both "PD LosAlamos" — Los
Alamos National Laboratory's own terms ask for a credit, even though
the images are otherwise free to use for any purpose), and
`leonardo-da-vinci` (CC BY 4.0, Wellcome Collection — legally requires
a credit, not just a courtesy). None of the three is currently
displayed anywhere in the running app; if these stay in the preset set,
add credit lines ("Photo: Los Alamos National Laboratory";
"Engraving: Wellcome Collection, CC BY 4.0") somewhere reachable (e.g.
a Settings/About page) to satisfy those conditions honestly.

Each master image (`assets/avatars/<key>.jpg`, 512×512) and its
128×128 web copy (`apps/web/src/assets/avatars/<key>.jpg`) is produced
by the uniform processing pipeline described above (background removal
→ auto-crop to subject → composite on the shared backdrop → teal-tint)
run against a manually chosen starting crop/region of the original
source image per subject.
