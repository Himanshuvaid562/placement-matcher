/**
 * Exercises the REAL routes, middleware, multer, validation and controller code for certificates.
 * Only the database models are replaced by small in-memory fakes, so this runs without MongoDB.
 * (workflow.test.js repeats the key flows against a real database.)
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

const mockDb = { credentials: [], files: [], seq: 0 };
const mockUsers = {};
const mockProfiles = {};
const mockSkills = {
  '64b0000000000000000000a1': { _id: '64b0000000000000000000a1', name: 'Node.js' },
  '64b0000000000000000000a2': { _id: '64b0000000000000000000a2', name: 'MongoDB' },
};

const mockMatches = (c, q = {}) => {
  if (q._id !== undefined && String(c._id) !== String(q._id)) return false;
  if (q.studentId !== undefined && String(c.studentId) !== String(q.studentId)) return false;
  if (q.status !== undefined && c.status !== q.status) return false;
  if (q["file.sha256"] !== undefined) {
    const want = q["file.sha256"];
    const got = c.file?.sha256;
    if (want && want.$in ? !want.$in.includes(got) : got !== want) return false;
  }
  return true;
};
const mockChain = (rows) => {
  let out = rows;
  const c = {
    populate: (path) => {
      out = out.map((r) => {
        if (path === "studentId") return { ...r, studentId: mockProfiles[r.studentId] || r.studentId };
        if (path === "skillId") return { ...r, skillId: r.skillId ? mockSkills[r.skillId] || r.skillId : r.skillId };
        return r;
      });
      return c;
    },
    sort: () => c, skip: () => c, limit: () => c, select: () => c,
    then: (res, rej) => Promise.resolve(out).then(res, rej),
  };
  return c;
};

jest.mock("../../src/models/User", () => ({
  findById: jest.fn((id) => ({
    select: jest.fn().mockResolvedValue(mockUsers[String(id)] ? { _id: String(id), ...mockUsers[String(id)] } : null),
  })),
}));
jest.mock("../../src/models/StudentProfile", () => ({
  findOne: jest.fn(async (q) => Object.values(mockProfiles).find((p) => String(p.userId) === String(q.userId)) || null),
}));
jest.mock("../../src/models/Skill", () => ({
  exists: jest.fn(async (q) => (mockSkills[String(q._id)] ? { _id: q._id } : null)),
}));
jest.mock("../../src/models/CredentialFile", () => ({
  create: jest.fn(async (doc) => { mockDb.files.push(doc); return doc; }),
  findOne: jest.fn(async (q) => mockDb.files.find((f) => String(f.credentialId) === String(q.credentialId)) || null),
  deleteOne: jest.fn(async (q) => { mockDb.files = mockDb.files.filter((f) => String(f.credentialId) !== String(q.credentialId)); }),
}));
jest.mock("../../src/models/Credential", () => ({
  countDocuments: jest.fn(async (q) => mockDb.credentials.filter((c) => mockMatches(c, q)).length),
  exists: jest.fn(async (q) => mockDb.credentials.find((c) => mockMatches(c, q)) || null),
  create: jest.fn(async (doc) => {
    const c = { _id: `cred${++mockDb.seq}`, status: "pending", createdAt: new Date(), ...doc, save: async function () { return this; } };
    mockDb.credentials.push(c);
    return c;
  }),
  findOne: jest.fn(async (q) => mockDb.credentials.find((c) => mockMatches(c, q)) || null),
  findById: jest.fn(async (id) => mockDb.credentials.find((c) => String(c._id) === String(id)) || null),
  findOneAndDelete: jest.fn(async (q) => {
    const c = mockDb.credentials.find((x) => mockMatches(x, q));
    if (c) mockDb.credentials = mockDb.credentials.filter((x) => x !== c);
    return c || null;
  }),
  deleteOne: jest.fn(async (q) => { mockDb.credentials = mockDb.credentials.filter((c) => !mockMatches(c, q)); }),
  find: jest.fn((q) => mockChain(mockDb.credentials.filter((c) => mockMatches(c, q)))),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");

const ID = { alice: "64b0000000000000000000c1", bob: "64b0000000000000000000c2", officer: "64b0000000000000000000c3" };
Object.assign(mockUsers, {
  [ID.alice]: { loginId: "12000001", role: "student", isActive: true, tokenVersion: 0, mustChangePassword: false },
  [ID.bob]: { loginId: "12000002", role: "student", isActive: true, tokenVersion: 0, mustChangePassword: false },
  [ID.officer]: { loginId: "10001", role: "officer", isActive: true, tokenVersion: 0, mustChangePassword: false },
});
Object.assign(mockProfiles, {
  profAlice: { _id: "profAlice", userId: ID.alice, registrationNumber: "12000001", department: "CSE", batchYear: 2026 },
  profBob: { _id: "profBob", userId: ID.bob, registrationNumber: "12000002", department: "IT", batchYear: 2026 },
});

const as = (who) => ({ Authorization: `Bearer ${jwt.sign({ id: ID[who], tv: 0 }, process.env.JWT_SECRET)}` });
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n");
const binary = (res, cb) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); };

const addCredential = (who, { file = PDF, filename = "certificate.pdf", ...fields } = {}) => {
  let req = request(app).post("/api/students/me/credentials").set(as(who))
    .field("type", fields.type ?? "mooc").field("title", fields.title ?? "Machine Learning").field("issuer", fields.issuer ?? "Coursera");
  for (const [k, v] of Object.entries(fields)) if (!["type", "title", "issuer"].includes(k)) req = req.field(k, v);
  if (file) req = req.attach("certificate", file, { filename, contentType: "application/pdf" });
  return req;
};

beforeEach(() => { mockDb.credentials = []; mockDb.files = []; mockDb.seq = 0; });

describe("student adds a certificate", () => {
  test("PDF + Drive link: stored, returned without internals, starts as pending", async () => {
    const res = await addCredential("alice", {
      issueDate: "2025-07-01", credentialId: "ABC-123",
      link: "https://drive.google.com/file/d/1AbC/view?usp=sharing",
    });
    expect(res.status).toBe(201);
    expect(res.body.credential).toMatchObject({
      type: "mooc", title: "Machine Learning", issuer: "Coursera", status: "pending",
      hasFile: true, fileName: "certificate.pdf", fileSize: PDF.length,
      linkHost: "drive.google.com", linkKnown: true, credentialId: "ABC-123",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/sha256|reviewedBy|"data"/);
    expect(mockDb.files).toHaveLength(1);
    expect(Buffer.compare(mockDb.files[0].data, PDF)).toBe(0); // exact bytes stored
    expect(mockDb.credentials[0].studentId).toBe("profAlice"); // bound to the caller, never to a client-supplied id
  });

  test("a link on its own is enough, and an unfamiliar site is stored as 'unknown'", async () => {
    const res = await addCredential("alice", { file: null, link: "https://certs.some-academy.com/verify/9" });
    expect(res.status).toBe(201);
    expect(res.body.credential).toMatchObject({ hasFile: false, linkKnown: false, linkHost: "certs.some-academy.com" });
    expect(mockDb.files).toHaveLength(0);
  });

  test("a PDF on its own is enough", async () => {
    const res = await addCredential("alice", { type: "certification", title: "AWS Cloud Practitioner", issuer: "Amazon" });
    expect(res.status).toBe(201);
    expect(res.body.credential.link).toBeUndefined();
  });

  test("a client cannot choose the owner or the status", async () => {
    const res = await addCredential("alice", { link: "https://drive.google.com/x", studentId: "profBob", status: "verified" });
    expect(res.status).toBe(201);
    expect(mockDb.credentials[0].studentId).toBe("profAlice");
    expect(mockDb.credentials[0].status).toBe("pending");
  });

  test("uploading the same file twice is refused", async () => {
    await addCredential("alice").expect(201);
    const again = await addCredential("alice", { title: "Same file again" });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already uploaded/);
    expect(mockDb.credentials).toHaveLength(1);
  });

  test("at most 25 certificates per student", async () => {
    for (let i = 0; i < 25; i++) mockDb.credentials.push({ _id: `x${i}`, studentId: "profAlice", status: "pending" });
    const res = await addCredential("alice");
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/at most 25/);
  });

  test("lists only my own certificates", async () => {
    await addCredential("alice", { title: "Alice's course" }).expect(201);
    await addCredential("bob", { title: "Bob's course", file: Buffer.concat([PDF, Buffer.from("bob")]) }).expect(201);
    const res = await request(app).get("/api/students/me/credentials").set(as("alice"));
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.title)).toEqual(["Alice's course"]);
  });
});

describe("what is refused before anything is stored", () => {
  const expectNothingStored = () => { expect(mockDb.credentials).toHaveLength(0); expect(mockDb.files).toHaveLength(0); };

  test("no proof at all", async () => {
    const res = await addCredential("alice", { file: null });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/PDF or a link/);
    expectNothingStored();
  });

  test.each([
    ["http link", "http://drive.google.com/file/d/1"],
    ["javascript: link", "javascript:alert(document.cookie)"],
    ["IP address link", "https://10.0.0.5/cert.pdf"],
    ["localhost link", "https://localhost/cert.pdf"],
    ["credential-stuffed link", "https://drive.google.com@evil.example.org/x"],
    ["not a link", "see my drive"],
  ])("%s", async (_n, link) => {
    const res = await addCredential("alice", { file: null, link });
    expect(res.status).toBe(422);
    expectNothingStored();
  });

  test("a PNG renamed to .pdf (right MIME type, wrong content)", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const res = await addCredential("alice", { file: png, filename: "totally-a-pdf.pdf" });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/not a valid PDF/);
    expectNothingStored();
  });

  test("a file sent with a non-PDF MIME type", async () => {
    const res = await request(app).post("/api/students/me/credentials").set(as("alice"))
      .field("type", "mooc").field("title", "Course").field("issuer", "Coursera")
      .attach("certificate", Buffer.from("<html></html>"), { filename: "x.html", contentType: "text/html" });
    expect(res.status).toBe(422);
    expectNothingStored();
  });

  test("a file over 3 MB", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3 * 1024 * 1024 + 10, 0x20)]);
    const res = await addCredential("alice", { file: big });
    expect(res.status).toBe(413);
    expectNothingStored();
  });

  test.each([
    ["missing title", { title: "" }],
    ["unknown type", { type: "badge" }],
    ["impossible date", { issueDate: "2025-02-30" }],
    ["future date", { issueDate: "2099-01-01" }],
  ])("%s", async (_n, fields) => {
    const res = await addCredential("alice", { link: "https://drive.google.com/x", file: null, ...fields });
    expect(res.status).toBe(422);
    expectNothingStored();
  });

  test("officers cannot upload (and nothing is buffered for them)", async () => {
    const res = await addCredential("officer");
    expect(res.status).toBe(403);
    expectNothingStored();
  });
});

describe("one-click viewing of the PDF", () => {
  let id;
  beforeEach(async () => {
    const res = await addCredential("alice", { filename: "My Certificate (final).pdf" });
    id = res.body.credential.id;
  });

  test("the officer gets the exact PDF, shown inline, never cached or sniffed", async () => {
    const res = await request(app).get(`/api/credentials/${id}/file`).set(as("officer")).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe('inline; filename="My_Certificate_final_.pdf"');
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(res.body, PDF)).toBe(0);
  });

  test("the owner can view their own file", async () => {
    const res = await request(app).get(`/api/students/me/credentials/${id}/file`).set(as("alice")).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, PDF)).toBe(0);
  });

  test("another student gets 'not found', not 'forbidden', so ids cannot be probed", async () => {
    const res = await request(app).get(`/api/students/me/credentials/${id}/file`).set(as("bob"));
    expect(res.status).toBe(404);
  });

  test("a link-only certificate has no file to show", async () => {
    const link = await addCredential("alice", { file: null, link: "https://drive.google.com/x" });
    const res = await request(app).get(`/api/credentials/${link.body.credential.id}/file`).set(as("officer"));
    expect(res.status).toBe(404);
  });

  test("an unknown id is a clean 404", async () => {
    expect((await request(app).get("/api/credentials/nope/file").set(as("officer"))).status).toBe(404);
  });

  test("no token, no file", async () => {
    expect((await request(app).get(`/api/credentials/${id}/file`)).status).toBe(401);
  });
});

describe("deleting", () => {
  test("a student can delete their own certificate, which also removes the stored PDF", async () => {
    const created = await addCredential("alice");
    const res = await request(app).delete(`/api/students/me/credentials/${created.body.credential.id}`).set(as("alice"));
    expect(res.status).toBe(200);
    expect(mockDb.credentials).toHaveLength(0);
    expect(mockDb.files).toHaveLength(0);
  });

  test("a student cannot delete someone else's certificate", async () => {
    const created = await addCredential("alice");
    const res = await request(app).delete(`/api/students/me/credentials/${created.body.credential.id}`).set(as("bob"));
    expect(res.status).toBe(404);
    expect(mockDb.credentials).toHaveLength(1);
    expect(mockDb.files).toHaveLength(1);
  });
});

describe("faculty review", () => {
  test("the list shows who uploaded what, and warns when the same PDF came from several students", async () => {
    await addCredential("alice", { title: "Alice ML" }).expect(201);
    await addCredential("bob", { title: "Bob ML (same file)" }).expect(201); // identical bytes
    await addCredential("bob", { title: "Bob link only", file: null, link: "https://drive.google.com/y" }).expect(201);

    const res = await request(app).get("/api/credentials?status=pending").set(as("officer"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    const byTitle = Object.fromEntries(res.body.data.map((c) => [c.title, c]));
    expect(byTitle["Alice ML"]).toMatchObject({ registrationNumber: "12000001", department: "CSE", sharedFileWithOtherStudents: 1 });
    expect(byTitle["Bob ML (same file)"]).toMatchObject({ registrationNumber: "12000002", sharedFileWithOtherStudents: 1 });
    expect(byTitle["Bob link only"].sharedFileWithOtherStudents).toBe(0);
    expect(JSON.stringify(res.body)).not.toMatch(/sha256|reviewedBy/);
  });

  test("approve, then reject with a reason the student can see", async () => {
    const created = await addCredential("alice");
    const id = created.body.credential.id;

    const ok = await request(app).post(`/api/credentials/${id}/approve`).set(as("officer"));
    expect(ok.status).toBe(200);
    expect(ok.body.credential.status).toBe("verified");
    expect((await request(app).post(`/api/credentials/${id}/approve`).set(as("officer"))).status).toBe(409);

    expect((await request(app).post(`/api/credentials/${id}/reject`).set(as("officer")).send({})).status).toBe(422);
    const rej = await request(app).post(`/api/credentials/${id}/reject`).set(as("officer")).send({ reason: "Name on the certificate does not match" });
    expect(rej.status).toBe(200);
    expect(rej.body.credential).toMatchObject({ status: "rejected", rejectionReason: "Name on the certificate does not match" });

    const mine = await request(app).get("/api/students/me/credentials").set(as("alice"));
    expect(mine.body.data[0]).toMatchObject({ status: "rejected", rejectionReason: "Name on the certificate does not match" });
    expect(JSON.stringify(mine.body)).not.toMatch(/reviewedBy|10001/); // the student never learns who reviewed it
  });

  test("students cannot review", async () => {
    const created = await addCredential("alice");
    expect((await request(app).post(`/api/credentials/${created.body.credential.id}/approve`).set(as("bob"))).status).toBe(403);
    expect((await request(app).get("/api/credentials").set(as("alice"))).status).toBe(403);
  });
});

describe("linking a certificate to a skill (evidence-backed skills)", () => {
  const NODE = "64b0000000000000000000a1";
  const link = { link: "https://drive.google.com/x", file: null };

  test("a student links a certificate to a skill and the level they say it covers", async () => {
    const res = await addCredential("alice", { ...link, skillId: NODE, skillLevel: "4" });
    expect(res.status).toBe(201);
    expect(res.body.credential).toMatchObject({ skill: { id: NODE }, skillLevel: 4, status: "pending" });
    expect(res.body.credential.awardedLevel).toBeUndefined(); // nothing is awarded until faculty approve
    expect(mockDb.credentials[0]).toMatchObject({ skillId: NODE, skillLevel: 4 });
  });

  test("the student's list shows the skill name, and the level cap", async () => {
    await addCredential("alice", { ...link, skillId: NODE, skillLevel: "4" }).expect(201);
    const res = await request(app).get("/api/students/me/credentials").set(as("alice"));
    expect(res.body.data[0].skill).toEqual({ id: NODE, name: "Node.js" });
    expect(res.body.levelCap).toBe(3);
  });

  test.each([
    ["a skill without a level", { skillId: NODE }],
    ["a level without a skill", { skillLevel: "3" }],
    ["a level above 5", { skillId: NODE, skillLevel: "6" }],
    ["a malformed skill id", { skillId: "nope", skillLevel: "3" }],
    ["a skill that is not in the catalog", { skillId: "64b0000000000000000000ff", skillLevel: "3" }],
  ])("refuses %s", async (_n, fields) => {
    const res = await addCredential("alice", { ...link, ...fields });
    expect(res.status).toBe(422);
    expect(mockDb.credentials).toHaveLength(0);
  });

  test("faculty can award a different level than the student claimed; it shows only once verified", async () => {
    const created = await addCredential("alice", { ...link, skillId: NODE, skillLevel: "5" });
    const id = created.body.credential.id;

    const ok = await request(app).post(`/api/credentials/${id}/approve`).set(as("officer")).send({ awardedLevel: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body.credential).toMatchObject({ status: "verified", skillLevel: 5, awardedLevel: 2 });
    expect(mockDb.credentials[0].awardedLevel).toBe(2);
  });

  test("with no awarded level given, the claimed level is awarded", async () => {
    const created = await addCredential("alice", { ...link, skillId: NODE, skillLevel: "4" });
    const ok = await request(app).post(`/api/credentials/${created.body.credential.id}/approve`).set(as("officer")).send({});
    expect(ok.body.credential.awardedLevel).toBe(4); // the matcher caps this later
  });

  test("an awarded level needs a skill link, and must be 1-5", async () => {
    const plain = await addCredential("alice", { ...link });
    const noSkill = await request(app).post(`/api/credentials/${plain.body.credential.id}/approve`).set(as("officer")).send({ awardedLevel: 3 });
    expect(noSkill.status).toBe(422);

    const linked = await addCredential("alice", { ...link, title: "Linked", skillId: NODE, skillLevel: "3" });
    for (const bad of [0, 6, 2.5]) {
      const res = await request(app).post(`/api/credentials/${linked.body.credential.id}/approve`).set(as("officer")).send({ awardedLevel: bad });
      expect(res.status).toBe(422);
    }
  });

  test("rejecting removes any awarded level, so a rejected certificate backs nothing", async () => {
    const created = await addCredential("alice", { ...link, skillId: NODE, skillLevel: "3" });
    const id = created.body.credential.id;
    await request(app).post(`/api/credentials/${id}/approve`).set(as("officer")).send({}).expect(200);
    expect(mockDb.credentials[0].awardedLevel).toBe(3);
    await request(app).post(`/api/credentials/${id}/reject`).set(as("officer")).send({ reason: "Name does not match" }).expect(200);
    expect(mockDb.credentials[0].awardedLevel).toBeUndefined();
  });

  test("the officer list shows the claimed skill and the current level cap", async () => {
    await addCredential("alice", { ...link, skillId: NODE, skillLevel: "4" }).expect(201);
    const res = await request(app).get("/api/credentials?status=pending").set(as("officer"));
    expect(res.body.data[0]).toMatchObject({ skill: { name: "Node.js" }, skillLevel: 4 });
    expect(res.body.levelCap).toBe(3);
  });
});

describe("grade / result on a certificate", () => {
  const link = { link: "https://drive.google.com/x", file: null };

  test("is stored and returned, so it can be printed on the resume", async () => {
    const res = await addCredential("alice", { ...link, result: "O Grade", credentialId: "100200" });
    expect(res.status).toBe(201);
    expect(res.body.credential).toMatchObject({ result: "O Grade", credentialId: "100200" });
    expect(mockDb.credentials[0].result).toBe("O Grade");
    const list = await request(app).get("/api/students/me/credentials").set(as("alice"));
    expect(list.body.data[0].result).toBe("O Grade");
  });

  test("the officer sees it too", async () => {
    await addCredential("alice", { ...link, result: "Elite + Gold" }).expect(201);
    const res = await request(app).get("/api/credentials?status=pending").set(as("officer"));
    expect(res.body.data[0].result).toBe("Elite + Gold");
  });

  test("is optional, and a value over 40 characters is refused", async () => {
    expect((await addCredential("alice", { ...link })).status).toBe(201);
    const tooLong = await addCredential("alice", { ...link, title: "Another", result: "x".repeat(41) });
    expect(tooLong.status).toBe(422);
    expect(mockDb.credentials).toHaveLength(1);
  });
});
