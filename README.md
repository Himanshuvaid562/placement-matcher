# P06 — LPU Placement Skill Matcher & Readiness Analyser

MVP implementation: auth + RBAC, student profile & skills, placement opportunity
management with eligibility rules, transparent eligibility + weighted skill matching,
rule-based recommendations, student dashboard, and a minimal officer admin panel.

## Run locally

### 1. Backend
```
cd backend
cp .env.example .env      # set JWT_SECRET (32+ chars) and OFFICER_INVITE_CODE
npm install
docker compose up -d      # local MongoDB on :27017
npm run seed               # demo officer + student + one opportunity (DELETES existing data; dev only)
npm run dev                 # http://localhost:5000
```

Demo logins created by the seed script (dev only). Login is by ID, not email:
- Faculty / Placement Officer: `10001` / `Officer@123`
- Student, already verified: `12000001` / `Student@123`
- Student, pending verification: `12000002` / `Student@123`. They claim CGPA 9.1 and 0 backlogs, but the
  university's record says 7.4 and 1 backlog, so approving them shows the "official record wins" behaviour.

New faculty accounts need the `OFFICER_INVITE_CODE` from your `.env` at registration.

`sample-data/official-records.csv` is a ready-made file for the officer's **Verification -> Import official records** screen.

### 2. Frontend
```
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

### 3. Tests
```
cd backend
npm run test:unit                                  # pure logic, no database
npx jest tests/integration/rbac.test.js            # authorization + validation, no database
MONGO_TEST_URI=mongodb://localhost:27017/p06_test npm run test:integration   # full workflow (DROPS that database)
```
Without `MONGO_TEST_URI` the workflow test tries to download an in-memory MongoDB; if that is not possible it
prints a SKIPPED warning (set `REQUIRE_DB_TESTS=1` to make that a failure, as CI does).

## What is implemented (MVP scope)
- JWT auth + bcrypt hashing + role-based middleware (student vs officer routes are hard-separated)
- Student profile CRUD, skill catalog, self-reported skill levels
- Assessment attempt flow that auto-verifies a skill level from an assessment score
- Officer: create companies, create/publish opportunities with required skills + eligibility rules
- Eligibility engine — per-rule pass/fail, never blended with skill scoring
- Skill-matching engine — weighted, capped-ratio score with full per-skill breakdown and source (verified/self/missing)
- Rule-based recommendation engine derived from the same breakdown
- Student dashboard + opportunity detail page (eligibility checklist, match gauge, breakdown table, recommendations)
- Officer analytics endpoints: skill distribution by department, eligible-students-per-opportunity, common skill gaps

## Added in iteration 2
- Officer skill-catalog manager, assessment authoring, student timed assessments, analytics page with charts

## Added in iteration 3
- **Security fixes:** officer accounts now require a server-side invite code (previously anyone could self-register as an officer); assessment attempts can only be submitted by their owner and only questions from that assessment can score; helmet, request-size limit, zod input validation, fail-fast config checks
- **Readiness over time:** snapshots are stored when the score or eligibility changes (or every 6 h) and charted on the opportunity page
- **Analytics:** overview cards (participation, profile completion), batch-wise summary, per-opportunity eligible-student CSV export (formula-injection safe)
- **Tests:** 64 tests that need no database (matching, eligibility, CSV, history rules, 50 RBAC/auth/validation cases) + a 22-step end-to-end workflow test that needs MongoDB
- **Deployment:** Dockerfiles, production compose file, Render blueprint, GitHub Actions CI, see `DEPLOYMENT.md`

## Added in iteration 4: university verification of student data
Students could previously enter any CGPA/department/backlogs and be treated as eligible. Now:
- Students enter a registration number plus their academic details and **submit for verification**.
- The Placement Officer (the university's verifier) imports the **official academic records** (CSV) and reviews each submission
  side-by-side with the official record. **When an official record exists, approval stores the official values, not the student's.**
  With no official record, the officer must explicitly confirm a manual document check.
- **Eligibility uses only the verified snapshot.** Students still see a clearly labelled *provisional* result; officers' eligible
  lists, CSV exports and department/batch analytics include only verified students (unverified ones are counted separately).
- **Editing any academic detail after verification resets it** (re-saving identical values does not).
- A registration number can be verified for only one account; students never see who reviewed them; every submit/approve/reject/revoke/reset/import is written to an audit log.
- Skills stay self-reported until a linked assessment verifies them (unchanged).

**What verification does and does not prove:** it proves the officer matched this account to an official record or to documents.
It cannot detect an officer approving the wrong person. That is why approval is explicit, logged, and revocable.
Certifications, internships and projects are not part of this workflow (they do not affect scoring and have no edit UI yet).

## Added in iteration 5: LPU-style identity
- **Students log in with their UMS registration number** (8+ digits, e.g. `12092351`); **faculty/placement officers with an employee ID** (5+ digits)
  plus the invite code. Email is no longer used for login. The rules live in one place: `backend/src/validators/auth.js`.
- A student's registration number **is** their login ID, fixed at sign-up and not editable. That also closes the earlier gap where a student could
  type someone else's number into their profile.
- **Account recovery:** a student who forgot their password, or whose number was registered by someone else first, visits the Placement Office.
  After checking their ID card, the officer clicks **Reset password** on the Verification page and reads out a one-time temporary password.
  The account must change it at first login, and **every existing session is signed out** (so a squatter is locked out).
- **Sessions are now revocable:** every request checks the user record, so a password change/reset, a disabled account, or a changed role takes effect immediately.
- Companies: officers can store an HR **contact email** on a company; it is never shown to students. Students also only see companies that currently have a published opportunity.
- The eligible-students CSV no longer contains emails (registration number + academic data only).

**Upgrading an existing database:** earlier versions logged in with email. Re-run `npm run seed` for demo data (it wipes data), or re-register real users.
The server drops the stale unique index on the old `email` field at startup.

**Not integrated with UMS.** This app keeps its own passwords; it never sees or checks the UMS password, and students are told not to reuse it.
True single sign-on would need LPU IT to provide an OAuth/SAML/LDAP endpoint. If they do, only `authController.login` has to change.

## Added in iteration 6: certificates and MOOCs
- Students add **certificates and MOOCs** (type, title, platform, date, credential ID) with proof as an **uploaded PDF**, a **Drive/certificate link**, or both.
- **Faculty review them in one click:** the **Certificates** page lists every student's proof. *View certificate* opens the PDF in a new tab; *Open link* opens the link in a new tab.
  Faculty then mark it verified, or reject it with a reason the student can see. From the Verification page, *View certificates* jumps to one student's.
- **Safety, since students control what faculty click on:**
  - PDFs: max 3 MB, checked by their real content (not just the file name or type), stored in MongoDB, served inline with `no-store` and `nosniff`; a student can only ever open their own.
  - Links: `https` only; IP addresses, `localhost`, `javascript:`/`data:` links, embedded credentials and custom ports are refused. Unfamiliar sites are accepted but flagged to faculty, because real certificate sites vary.
  - Faculty are warned when **the same PDF was uploaded by other students**.
  - At most 25 certificates per student, and uploads are rate-limited. Anonymous users cannot upload.
- Certificates are informational: they do **not** change eligibility or the match score.
- Google Drive links must be shared as **"Anyone with the link can view"**, otherwise faculty hit a "request access" page. The upload form and review page both say so.
- `npm run seed` adds demo certificates: 12000001 has one verified; 12000002 has three pending, one with the same PDF as 12000001's (shows the duplicate warning) and one linking to an unrecognised site.

## Added in iteration 7: what makes this more than a document store
UMS already stores records, certificates and resumes. These three features are the analysis and trust layer on top:

**1. Evidence-backed skills.** A certificate can be linked to a skill (and the level the student says it covers). Once **faculty verify it and award a level**,
it becomes a middle evidence tier: *self-reported < certificate-backed < assessment-verified*.
- A certificate shows exposure, not mastery, so it counts only **up to level 3** (`CERTIFICATE_LEVEL_CAP`); an assessment can take a student higher.
- Adding evidence can raise a score or upgrade how trustworthy a row is, **never lower it** (checked exhaustively in the tests).
- Match breakdowns show what each level is backed by ("Assessment", "Certificate", "Self-reported", "No evidence") and the other evidence on file.
- Rejecting or deleting a certificate removes its effect at once. Officer analytics use the same rules.

**2. "What if...?" simulator** (`/what-if`). Shows how raising a skill would change the match, using the same scoring engine, and writes nothing.
- *Your best next skills:* ranks skills by total lift across the roles the student can actually apply to (roles they are academically ineligible for are left out, and the page says so).
- *Try your own:* pick a role, choose target levels, see baseline vs scenario, the per-skill effect, and the ripple on other open roles.
- It only ever raises levels, and says when its advice rests on unverified academic details.

**3. University-verified resume** (`/resume`, public page `/verify/<token>`).
- **The PDF reproduces the placement cell's recommended format** (a Word template). `sample-data/example-resume.pdf` is the output; `example-resume-with-verification-marks.pdf` is the same resume with the optional marks switched on.
  The geometry was **measured from the template**, not eyeballed: A4, Arial-metric Helvetica at 10 pt, 20 pt navy name, real small-caps headings (#473992) with a thin rule, label/value skill rows, project title + *Link* + month at the right,
  bullets whose wrapped lines return to the bullet, grey italic *Technologies:* line, Training, Certificates, Education. Left edges agree with the template to within about 1 pt; sizes and colours are identical.
  It is real selectable text in one column, and the five section headings extract as whole words (`SKILLS`, not `S KILLS`) in both poppler and pypdf; a regression test guards that.
- **What the student types:** name, contact, skill groups, projects, training, the degree and dates of the university entry, and any school entries. There is no summary, experience or achievements section, because the format has none.
- **What is filled in from verified records, and cannot be typed:** the university entry's department (shown in full, e.g. *Computer Science and Engineering*) and CGPA, and the Certificates section (faculty-verified only). Each certificate's second line is
  `<result> | Cert No. <id>` plus a *Link*, like the template's `O Grade| Cert No. … Link`; **result** is an optional field on the certificate (e.g. "O Grade"). A student's typed CGPA or department is ignored by the server.
- **Verification marks are OPT-IN.** By default the PDF contains nothing the template does not. Tick **Add verification marks and notes** to get: `*` after skills an assessment backs, `†` after skills a verified certificate backs (with a short legend),
  "Verified by the university (Oct’26)" under Education, and a faculty-verified note under Certificates. School entries are never marked: the platform cannot verify them.
- Skill lists split on commas outside brackets, so `Linux (Arch, Kali, Ubuntu)` stays one item. The PDF uses the built-in Helvetica: it draws Latin letters, em/en dashes, curly quotes and bullets exactly like the template, maps `→` to `->`, and prints other scripts (e.g. Devanagari) as `?`. Content longer than a page flows onto a second page rather than being cut off.
- Known small differences from the template: it spells some months in full ("July") and has free-typed text on the certificate line ("LPU — O Grade"); the PDF uses a three-letter month and the *result* field. Where the template's own spacing is inconsistent (section gaps of 15, 27 and 31 pt), the PDF uses one consistent gap.
- **Recruiter verification link + QR:** shows only university-verified facts (academic status, evidenced skills, faculty-verified certificates), never contact details or self-reported skills. The student picks expiry (7/30/90 days) and whether CGPA / registration number are shown, and can revoke it. Only a hash of the token is stored, bad/expired/revoked links all look identical, and if verification is later withdrawn the page stops vouching for the numbers.
- **Role check:** lists which of a role's required skills are in the resume's Skills section, appear only in projects/training, or are missing, with specific advice. It is a keyword check, not a prediction of any employer's screening.

**Presentation demo (after `npm run seed`):**
1. Log in as `12000001`. Open **What-if**: MongoDB is the best next skill (+25 points on the demo role).
2. Open **Certificates**: a pending "MongoDB Basics" certificate is linked to MongoDB. Log in as faculty `10001`, open **Certificates**, award a level and mark it verified.
3. Back as the student, the match goes **46.2% to 71.2%** and the MongoDB row now says "Certificate".
4. Open **Resume**, create a verification link, and open it in a private window with no login. The seed also prints a ready-made link.

**Known limits.** PDF fonts cover Latin letters only (other scripts print as "?"; the form says so). The recruiter page shows the student's own entry for their name
(the platform stores no verified names) and says so. Anyone holding a link can open it until it expires or is revoked, so treat it like a shared document.
Certificates are stored in MongoDB (see `DEPLOYMENT.md`).

## Still left for later
- UMS single sign-on (needs LPU IT), password recovery for faculty accounts (students are covered by the officer reset), httpOnly-cookie sessions
- Internships and projects are not yet captured with proof; moving PDFs to object storage (S3/Cloudinary) if volume grows; scheduled re-sync with the university's records
- Resume parsing with student confirmation, AI-assisted recommendations and interview prep
- Pagination on the analytics candidate lists (they currently evaluate all students in memory, fine for a cohort of thousands, not for hundreds of thousands)
