# Moonroot Patient Case Cards

- **Total cards**: 38
- **Ruleset version**: 1.0 (**UNREVIEWED**)
- **Source**: Generated from `core/triage/caseCards.ts` via `npm run rules:export`. The same cards execute as tests in Step 2 so the review packet and engine cannot drift apart.

## CASE-01: RED-01: Soaking hourly for 2 hours

- **Category**: red-rule
- **Patient scenario**: Age 21. Heavy flow today; soaked through 1 pad every hour for 2 hours in a row.
- **Answers logged**: Flow: heavy · Soaked >= 1/hr for 2+ hours: yes · Danger screen: none
- **App verdict**: `red` · **Rules**: `RED-01`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-02: RED-02: Medium flow with dizziness

- **Category**: red-rule
- **Patient scenario**: Age 19. Medium flow today and feels dizzy when standing up.
- **Answers logged**: Flow: medium · Pain: 2/10 · Danger sign: dizzy
- **App verdict**: `red` · **Rules**: `RED-02`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-03: RED-03: Sudden severe belly pain with nausea

- **Category**: red-rule
- **Patient scenario**: Age 22. No bleeding today, but sudden 8/10 lower belly pain with nausea.
- **Answers logged**: Flow: none · Pain: 8/10, sudden, lower-middle · Danger sign: nausea
- **App verdict**: `red` · **Rules**: `RED-03`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-04: RED-04: Shoulder-tip pain when pregnancy is possible

- **Category**: red-rule
- **Patient scenario**: Age 24. Spotting with 2/10 shoulder-tip pain; answered Yes to chance of pregnancy.
- **Answers logged**: Flow: spotting · Pain: 2/10, shoulder-tip · Pregnancy chance: yes
- **App verdict**: `red` · **Rules**: `RED-04`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-05: RED-05: Positive pregnancy test with mild pain

- **Category**: red-rule
- **Patient scenario**: Age 23. Logged a positive pregnancy test today along with 1/10 lower belly cramps.
- **Answers logged**: Flow: none · Pain: 1/10, lower-middle · Pregnancy test: positive
- **App verdict**: `red` · **Rules**: `RED-05`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-06: RED-06: Tampon in use with fever 39.2 °C

- **Category**: red-rule
- **Patient scenario**: Age 20. Medium flow using a tampon, measured fever 39.2 °C.
- **Answers logged**: Flow: medium · Protection: tampon · Fever: 39.2 °C · Pain: 2/10
- **App verdict**: `red` · **Rules**: `RED-06`
- **Display / clinical notes**: Shows "Remove the tampon or cup now." before anything else
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-07: RED-07: Fever 38.2 °C with lower belly pain

- **Category**: red-rule
- **Patient scenario**: Age 21. No bleeding, using no tampon/cup, measured fever 38.2 °C and 3/10 lower belly pain.
- **Answers logged**: Flow: none · Fever: 38.2 °C · Pain: 3/10, lower-middle
- **App verdict**: `red` · **Rules**: `RED-07`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-08: RED-08: Pain 9/10 not helped by medicine

- **Category**: red-rule
- **Patient scenario**: Age 19. Heavy flow with 9/10 cramps; took usual pain medicine and tapped No for relief.
- **Answers logged**: Flow: heavy · Pain: 9/10 · Pain relief helped: no
- **App verdict**: `red` · **Rules**: `RED-08`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-09: RED-09: Fainting logged with no flow and no pain

- **Category**: red-rule
- **Patient scenario**: Age 20. Logged no flow and 0 pain, but ticked Fainted on the danger-sign screen.
- **Answers logged**: Flow: none · Pain: 0/10 · Danger sign: fainted
- **App verdict**: `red` · **Rules**: `RED-09`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-10: RED-10: Sudden left-sided pain 5/10 with vomiting

- **Category**: red-rule
- **Patient scenario**: Age 18. Sexual health questions off. Sudden 5/10 pain on the left side with vomiting.
- **Answers logged**: Flow: none · Pain: 5/10, left, sudden · Danger sign: vomiting
- **App verdict**: `red` · **Rules**: `RED-10`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-11: RED-11: Combined pill with leg pain or swelling

- **Category**: red-rule
- **Patient scenario**: Age 22. Taking combined pill. Logged no flow, 0 pain, and leg pain or swelling.
- **Answers logged**: Hormone: combined-pill · Flow: none · Danger sign: leg-pain-or-swelling
- **App verdict**: `red` · **Rules**: `RED-11`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-12: ORG-01: Period with 8 logged bleeding days

- **Category**: orange-rule
- **Patient scenario**: Age 20. Current period has 8 logged days of light-to-heavy bleeding with no gaps.
- **Answers logged**: Period bleeding days: 8 · No red danger signs today
- **App verdict**: `orange` · **Rules**: `ORG-01`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-13: ORG-02: Heavy flow with clots bigger than a coin

- **Category**: orange-rule
- **Patient scenario**: Age 21. Heavy bleeding today with clots bigger than a 2.5 cm coin, no dizziness.
- **Answers logged**: Flow: heavy · Clots: large · Danger screen: none
- **App verdict**: `orange` · **Rules**: `ORG-02`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-14: ORG-03: 90 days since last period start

- **Category**: orange-rule
- **Patient scenario**: Age 19. Last confirmed period started 90 days ago; logged no flow today.
- **Answers logged**: Days since last period start: 90 · Flow: none · Pain: 0/10
- **App verdict**: `orange` · **Rules**: `ORG-03`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-15: ORG-04: Two of last three cycles shorter than 21 days

- **Category**: orange-rule
- **Patient scenario**: Age 22. Last 3 completed cycles were 31, 19, and 20 days.
- **Answers logged**: Recent cycles: 31, 19, 20 days · Today: light flow, pain 1/10
- **App verdict**: `orange` · **Rules**: `ORG-04`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-16: ORG-05: Two of last three cycles longer than adult 38-day limit

- **Category**: orange-rule
- **Patient scenario**: Age 22, first period at 13. Last 3 completed cycles were 33, 42, and 56 days.
- **Answers logged**: Recent cycles: 33, 42, 56 days · Adult limit: > 38 days
- **App verdict**: `orange` · **Rules**: `ORG-05`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-17: ORG-06: Bleeding after sex with pain

- **Category**: orange-rule
- **Patient scenario**: Age 23, active. Logged bleeding after sex once with pain during sex.
- **Answers logged**: Intimacy: protected, bleedingAfter=yes, painDuring=yes
- **App verdict**: `orange` · **Rules**: `ORG-06`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-18: ORG-07: In-between spotting twice in 3 months

- **Category**: orange-rule
- **Patient scenario**: Age 21. Had two spotting runs in the last 90 days that did not become a period within 14 days.
- **Answers logged**: Intermenstrual spotting runs in 90d: 2 · Today: no flow, pain 0/10
- **App verdict**: `orange` · **Rules**: `ORG-07`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-19: ORG-08: Spotting 7 days in a row

- **Category**: orange-rule
- **Patient scenario**: Age 20. Logged spotting every day for 7 days straight with no heavier flow.
- **Answers logged**: Consecutive spotting days: 7 · Pain: 1/10
- **App verdict**: `orange` · **Rules**: `ORG-08`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-20: ORG-09: Severe period pain stopping normal activities in 2 of 3 periods

- **Category**: orange-rule
- **Patient scenario**: Age 21. Pain reached 7/10 or stopped daily activities in 2 of her last 3 periods.
- **Answers logged**: 2 of last 3 periods had pain >= 7 or stopped activities
- **App verdict**: `orange` · **Rules**: `ORG-09`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-21: ORG-10: Two heavy days with unusual tiredness and paleness

- **Category**: orange-rule
- **Patient scenario**: Age 20. Yesterday and today were both heavy flow; today ticked very pale and unusually tired.
- **Answers logged**: Heavy flow days in episode: 2 · Danger signs: very-pale, unusual-tiredness
- **App verdict**: `orange` · **Rules**: `ORG-10`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-22: ORG-11: Positive pregnancy test with no pain or bleeding

- **Category**: orange-rule
- **Patient scenario**: Age 24. Positive pregnancy test today; flow is none and pain is 0/10.
- **Answers logged**: Pregnancy test: positive · Flow: none · Pain: 0/10
- **App verdict**: `orange` · **Rules**: `ORG-11`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-23: ORG-12: Blood from back passage outside a period

- **Category**: orange-rule
- **Patient scenario**: Age 21. Not on period (flow=none). Answered "back passage" to blood-in-stool question.
- **Answers logged**: Flow: none · Stool blood source: back-passage
- **App verdict**: `orange` · **Rules**: `ORG-12`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-24: ORG-13: 14 days after negative pregnancy test with no period

- **Category**: orange-rule
- **Patient scenario**: Age 23. Logged a negative test 14 days ago; still no period and pregnancy was possible.
- **Answers logged**: Days since negative test: 14 · Pregnancy possible: yes · Flow: none
- **App verdict**: `orange` · **Rules**: `ORG-13`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-25: ORG-14: Moderate pain (5/10) with dizziness and no flow

- **Category**: orange-rule
- **Patient scenario**: Age 20. No flow today, pain 5/10 in lower middle, ticked Dizzy on danger screen.
- **Answers logged**: Flow: none · Pain: 5/10 · Danger sign: dizzy
- **App verdict**: `orange` · **Rules**: `ORG-14`
- **Display / clinical notes**: Today rule (not an event card)
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-26: ORG-15: Smelly or yellow-green discharge still present at 72h check

- **Category**: orange-rule
- **Patient scenario**: Age 21. Logged yellow-green discharge 3 days ago; answered Yes at the 72-hour watch check.
- **Answers logged**: 72h watch check (discharge-still-there): yes
- **App verdict**: `orange` · **Rules**: `ORG-15`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-27: Near RED-01: Changing pad every 1-2h without hourly soaking for 2h

- **Category**: below-threshold
- **Patient scenario**: Age 21. Heavy flow changing every 1-2h, NOT soaking hourly for 2h; no danger signs.
- **Answers logged**: Flow: heavy · soakedPerHour: false · changeEvery: under-2h · Danger: none
- **App verdict**: `orange` · **Rules**: `ORG-02`
- **Display / clinical notes**: Fires ORG-02 (Orange), does NOT fire RED-01
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-28: Near RED-06: Tampon with measured fever 38.9 °C and no pain/discharge

- **Category**: below-threshold
- **Patient scenario**: Age 22. Medium flow with tampon, measured temp 38.9 °C (below 39.0 °C), pain 0, normal discharge.
- **Answers logged**: Protection: tampon · Fever: 38.9 °C · Pain: 0/10 · Danger: none
- **App verdict**: `green` · **Rules**: `GRN-01`
- **Display / clinical notes**: Just below 39.0 °C TSS threshold; clinician to review 38.0-38.9 with tampon
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-29: Conservative fever default: Cup + felt feverish with no thermometer

- **Category**: below-threshold
- **Patient scenario**: Age 22. Using menstrual cup and feels feverish, with no measured temperature.
- **Answers logged**: Protection: cup · Fever: felt=true, no c · Pain: 1/10
- **App verdict**: `red` · **Rules**: `RED-06`
- **Display / clinical notes**: Conservative user decision #2 (unreviewed): felt fever without temp meets fever threshold
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-30: Near RED-07: Measured fever 37.9 °C with lower-middle pain 2/10

- **Category**: below-threshold
- **Patient scenario**: Age 21. No flow, measured fever 37.9 °C (even with felt=true, measured number rules), pain 2/10.
- **Answers logged**: Fever: 37.9 °C · Pain: 2/10, lower-middle · Danger: none
- **App verdict**: `green` · **Rules**: `GRN-01`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-31: Near ORG-01: Exactly 7 known bleeding days (with 1 unlogged day in episode)

- **Category**: below-threshold
- **Patient scenario**: Age 20. Current period has 7 logged bleeding days (unlogged day is not counted).
- **Answers logged**: Known bleeding days: 7 · No heavy/danger signs
- **App verdict**: `green` · **Rules**: `GRN-01`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-32: Near ORG-03: 89 days since last period start

- **Category**: below-threshold
- **Patient scenario**: Age 20. 89 days since last period start (just below 90-day orange line).
- **Answers logged**: Days since last period start: 89 · Flow: none · Pain: 0/10
- **App verdict**: `green` · **Rules**: `GRN-01`
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-33: Open decision edge case: Pain 8/10, not sudden, no pain medicine tried

- **Category**: below-threshold
- **Patient scenario**: Age 21. Flow=none, pain=8/10, sudden=false, reliefHelped=none-taken, danger=none.
- **Answers logged**: Flow: none · Pain: 8/10 · Sudden: no · Relief helped: none-taken
- **App verdict**: `green` · **Rules**: `GRN-01`
- **Display / clinical notes**: Open decision: pain >= 8 with no medicine tried awaits clinician threshold
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-34: Law 1 fix (YEL-02): Cramps 5/10, no flow, plus non-ORG-14 warning sign

- **Category**: law-preservation
- **Patient scenario**: Age 20. No flow, cramps 5/10, and ticked unusual tiredness on danger screen.
- **Answers logged**: Flow: none · Pain: 5/10 · Danger sign: unusual-tiredness
- **App verdict**: `yellow` · **Rules**: `YEL-02`
- **Display / clinical notes**: Adding unusual-tiredness must keep Yellow and never lower to Green
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-35: Law 1 fix (YEL-08): Yellow-green discharge with low fever 37.5 °C

- **Category**: law-preservation
- **Patient scenario**: Age 21. Logged yellow-green discharge and fever 37.5 °C (below RED-07 38.0 °C).
- **Answers logged**: Discharge: yellow-green · Fever: 37.5 °C · Pain: 0/10
- **App verdict**: `yellow` · **Rules**: `YEL-08`
- **Display / clinical notes**: Fever below 38 °C must keep Yellow and never lower to Green
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-36: Law 4 (No false reassurance): Heavy flow with danger screen unanswered

- **Category**: safety-guardrail
- **Patient scenario**: Age 20. Logged heavy flow and 2/10 pain, then backed out without answering the danger-sign screen.
- **Answers logged**: Flow: heavy · Pain: 2/10 · Danger screen: unanswered
- **App verdict**: `incomplete` · **Rules**: `None`
- **Display / clinical notes**: Shows "Answer 1 more question to see a result"; never shows Green
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-37: Age rule (Under 18): Neutral pregnancy question + parent/nurse guidance

- **Category**: safety-guardrail
- **Patient scenario**: Age 16. Spotting with 2/10 right-sided pain; answered Yes to neutral pregnancy question.
- **Answers logged**: Age: 16 · Flow: spotting · Pain: 2/10, right · Pregnancy chance: yes
- **App verdict**: `red` · **Rules**: `RED-04`
- **Display / clinical notes**: Adds "Tell a parent, relative or school nurse if you can."
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________

## CASE-38: Open event card guardrail: Quiet day while earlier Orange card is unclosed

- **Category**: safety-guardrail
- **Patient scenario**: Age 22. Today logged flow=none, pain=0, danger=none, while an earlier ORG-03 card is still open.
- **Answers logged**: Flow: none · Pain: 0/10 · Open event cards: 1
- **App verdict**: `open-event-notice` · **Rules**: `None`
- **Display / clinical notes**: Replaces Green with "Nothing new today. An earlier flag is still open."
- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________
