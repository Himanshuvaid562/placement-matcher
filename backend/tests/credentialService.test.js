const {
  classifyLink, isKnownHost, assertPdf, safePdfName, sha256, publicCredential,
} = require("../src/services/credentialService");

const reject = (fn) => { try { fn(); } catch (e) { return e; } throw new Error("expected a rejection"); };

describe("classifyLink: accepted links", () => {
  test("a Google Drive share link is accepted and recognised", () => {
    const r = classifyLink("https://drive.google.com/file/d/1AbCdEf/view?usp=sharing");
    expect(r).toMatchObject({ host: "drive.google.com", known: true });
    expect(r.url).toMatch(/^https:\/\/drive\.google\.com\//);
  });

  test.each([
    "https://www.coursera.org/account/accomplishments/verify/ABC123",
    "https://onlinecourses.nptel.ac.in/noc24_cs10/preview",
    "https://www.credly.com/badges/abc",
    "https://docs.google.com/document/d/xyz/edit",
    "https://myuni-my.sharepoint.com/:b:/g/personal/x",
  ])("recognises %s", (u) => expect(classifyLink(u).known).toBe(true));

  test("an unfamiliar site is ACCEPTED but flagged, so real certificate sites are never blocked", () => {
    const r = classifyLink("https://certs.some-small-academy.com/verify/123");
    expect(r.known).toBe(false);
    expect(r.host).toBe("certs.some-small-academy.com");
  });

  test("surrounding whitespace is trimmed and the host is lower-cased", () => {
    expect(classifyLink("  https://Drive.Google.COM/file/d/1  ").host).toBe("drive.google.com");
  });
});

describe("classifyLink: rejected links", () => {
  test.each([
    ["plain http", "http://drive.google.com/file/d/1"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
    ["ftp", "ftp://example.com/a.pdf"],
    ["empty", "   "],
    ["not a url", "my certificate is on drive"],
    ["no scheme", "drive.google.com/file/d/1"],
    ["IPv4", "https://192.168.1.10/cert.pdf"],
    ["loopback", "https://127.0.0.1/cert.pdf"],
    ["decimal-encoded IP", "https://2130706433/cert.pdf"],
    ["IPv6", "https://[::1]/cert.pdf"],
    ["localhost", "https://localhost/cert.pdf"],
    ["internal name", "https://intranet.internal/cert.pdf"],
    ["no real TLD", "https://myserver/cert.pdf"],
    ["embedded credentials", "https://drive.google.com@evil.example.com/x"],
    ["username/password", "https://user:pass@example.com/x"],
    ["custom port", "https://example.com:8443/x"],
    ["too long", "https://example.com/" + "a".repeat(600)],
  ])("rejects %s", (_name, link) => {
    expect(reject(() => classifyLink(link)).statusCode).toBe(422);
  });
});

describe("isKnownHost: look-alike domains are not trusted", () => {
  test.each([
    ["coursera.org.evil.com", false],
    ["evilcoursera.org", false],
    ["notdrive.google.com.attacker.io", false],
    ["xn--coursra-j9a.org", false], // punycode look-alike
    ["www.coursera.org", true],
    ["coursera.org", true],
  ])("%s -> %s", (host, expected) => expect(isKnownHost(host)).toBe(expected));
});

describe("assertPdf", () => {
  test("accepts a buffer that starts with %PDF-", () => {
    expect(() => assertPdf(Buffer.from("%PDF-1.7\n1 0 obj\n"))).not.toThrow();
  });
  test.each([
    ["a PNG renamed to .pdf", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
    ["HTML", Buffer.from("<html><script>alert(1)</script></html>")],
    ["an executable", Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00")],
    ["too short", Buffer.from("%PDF")],
    ["empty", Buffer.alloc(0)],
    ["a PDF header not at the start", Buffer.from("xx%PDF-1.4 more bytes here")],
  ])("rejects %s", (_n, buf) => expect(reject(() => assertPdf(buf)).statusCode).toBe(422));
  test("rejects a missing buffer", () => expect(reject(() => assertPdf(undefined)).statusCode).toBe(422));
});

describe("safePdfName", () => {
  test.each([
    ["Coursera Certificate (final).pdf", "Coursera_Certificate_final_.pdf"],
    ["../../etc/passwd", "etc_passwd.pdf"],
    ['evil"name\r\nSet-Cookie: x=1.pdf', "evil_name_Set-Cookie_x_1.pdf"],
    ["சான்றிதழ்.pdf", "certificate.pdf"],
    ["", "certificate.pdf"],
    [undefined, "certificate.pdf"],
    [".hidden.pdf", "hidden.pdf"],
  ])("%j -> %s", (input, expected) => expect(safePdfName(input)).toBe(expected));

  test("is always ASCII-safe, short, and ends in .pdf (no header injection)", () => {
    const out = safePdfName("a".repeat(500) + '"\r\n');
    expect(out).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
    expect(out.length).toBeLessThanOrEqual(84);
  });
});

describe("sha256 and publicCredential", () => {
  test("sha256 is stable and content-based", () => {
    expect(sha256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256(Buffer.from("abc"))).not.toBe(sha256(Buffer.from("abd")));
  });

  test("the public shape never exposes the reviewer, the file hash, or file bytes", () => {
    const out = publicCredential({
      _id: "c1", type: "mooc", title: "T", issuer: "I", status: "verified",
      reviewedBy: "officer-id", file: { name: "a.pdf", size: 10, sha256: "deadbeef" }, data: Buffer.from("x"),
    });
    expect(out.hasFile).toBe(true);
    expect(out.fileName).toBe("a.pdf");
    expect(JSON.stringify(out)).not.toMatch(/reviewedBy|officer-id|deadbeef|sha256/);
    expect(out).not.toHaveProperty("data");
  });

  test("a link-only credential reports hasFile=false", () => {
    expect(publicCredential({ _id: "c2", link: "https://x.org/" }).hasFile).toBe(false);
  });
});
