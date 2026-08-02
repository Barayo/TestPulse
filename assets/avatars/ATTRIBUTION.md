# Avatar preset attribution

Twelve preset avatars (`add-user-profile`), all sourced from Wikimedia
Commons and individually license-checked at the time of sourcing
(2026-08-02). Each image is square-cropped from the original (crop
region chosen manually per image, see below) and re-encoded; none are
resold or used for any commercial endorsement, and none depict a living
person's likeness for a purpose implying their endorsement.

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

Originally considered and **rejected**: Rosalind Franklin — her
best-known photographs have unclear/disputed copyright status (the
National Portrait Gallery manages licensing for portraits of her, and
ownership of the DNA photograph specifically is undocumented); not
worth the exposure for a redistributed open-source app. Emmy Noether
substituted instead.

Each master image (`assets/avatars/<key>.jpg`, 512×512) is a square
crop of the original — full-width top-aligned for straightforward
bust/headshot portraits, a manually chosen region for the three
full-figure sources (`katherine-johnson`, `mary-anning`,
`emmy-noether`) where a naive crop would have missed the subject's
face. `apps/web/src/assets/avatars/<key>.jpg` (128×128) is the
web-bundled copy actually rendered by the app.
