STEP 4 OUTPUT - Nepali text split per report section, aligned to the web page's English units
==========================================================================================

ne/<section>.txt          One line per English "unit" on the page, in page order
                          (same order and count as en_units.json / extract.py).
                          Sections: exec-summary ch1 ch2 ch3 ch4 ch5 moving-forward references
ne/<section>.report.txt   Side-by-side EN / NE for review, with flags:
                            REVIEW: shares a doc line ...   -> the .doc merges paragraphs; where one
                                                               ends and the next begins is a guess
                            REVIEW: doc text much longer ... -> check the pairing
                            DRAFT                            -> 10 short items written by Claude, NOT in the .doc:
                                                               6 chapter labels (अध्याय १-६), the exec-summary
                                                               heading, 'Back Matter', 'Full Reference List',
                                                               and the donidcr website line
en_units.json             English units extracted from index.html (the input)
todo_for_translation.txt  The 22 English units that have no Nepali anywhere in the .doc

Markers inside ne/*.txt
  @@TODO@@   no Nepali exists in the .doc for this unit  -> runtime should fall back to English
  @@KEEP@@   intentionally not translated (the 37 bibliography entries are English in both editions)

Not covered by this step (already handled by translations.js, or not part of the .doc):
  glance, front-matter (acronyms/terms), research-areas, nav/UI strings, map tooltips,
  footnote popups, and the small "mini timeline" in the sticky side panel of chapter 2.

Scripts:  extract.py (step 2)   align2.py (the alignment)   view.py <section> [from to]  (compact viewer)
