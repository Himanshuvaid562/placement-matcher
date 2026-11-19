/**
 * Pure helpers for certificates: link screening, PDF checks, safe file names, public shape.
 */
const crypto = require("crypto");
const ApiError = require("../utils/ApiError");

const MAX_PDF_BYTES = 3 * 1024 * 1024;
const MAX_CREDENTIALS_PER_STUDENT = 25;

// Sites students normally use for proof. A link to anything else is still accepted (so a real
// certificate site is never blocked) but is flagged to the faculty member before they click.
const KNOWN_HOSTS = [
  "drive.google.com", "docs.google.com", "drive.usercontent.google.com",
  "onedrive.live.com", "1drv.ms", "sharepoint.com", "dropbox.com",
  "coursera.org", "edx.org", "udemy.com", "udacity.com", "futurelearn.com", "skillshare.com",
  "nptel.ac.in", "swayam.gov.in", "swayam2.ac.in", "onlinecourses.nptel.ac.in",
  "credly.com", "credential.net", "linkedin.com", "freecodecamp.org", "hackerrank.com",
  "kaggle.com", "learn.microsoft.com", "microsoft.com", "aws.amazon.com", "certmetrics.com",
  "google.com", "oracle.com", "cisco.com", "ibm.com", "infosys.com", "onwingspan.com",
  "salesforce.com", "mongodb.com", "learn.mongodb.com", "meta.com", "deeplearning.ai", "scrum.org", "pmi.org", "github.com", "verify.skilljar.com",
];

const isKnownHost = (host) => KNOWN_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));

/**
 * Screens a student-supplied proof link. It is shown to faculty as a clickable link, so it must not be
 * a script, a local/internal address, or disguised with credentials. The server never fetches it.
 */
function classifyLink(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new ApiError(422, "The link is empty");
  if (text.length > 500) throw new ApiError(422, "The link is too long");

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ApiError(422, "That does not look like a valid link. Paste the full address starting with https://");
  }

  if (url.protocol !== "https:") throw new ApiError(422, "Only secure https:// links are accepted");
  if (url.username || url.password) throw new ApiError(422, "Links containing a username or password are not accepted");
  if (url.port) throw new ApiError(422, "Links with a custom port are not accepted");

  const host = url.hostname.toLowerCase();
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.startsWith("[");
  const looksInternal = host === "localhost" || /\.(local|localhost|internal|lan|home)$/.test(host);
  const hasRealTld = /\.([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host);
  if (isIpv4 || isIpv6 || looksInternal || !hasRealTld) {
    throw new ApiError(422, "Use a link to a website (such as Google Drive or the course platform), not an IP address or local address");
  }

  return { url: url.href, host, known: isKnownHost(host) };
}

/** A real PDF starts with "%PDF-". The browser-supplied MIME type is not trusted on its own. */
function assertPdf(buffer) {
  if (!buffer || buffer.length < 8 || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ApiError(422, "That file is not a valid PDF");
  }
}

/** File name used in the Content-Disposition header: ASCII only, always ends in .pdf. */
function safePdfName(name) {
  const base = String(name || "certificate").replace(/\.pdf$/i, "");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+/, "").slice(0, 80);
  return `${cleaned || "certificate"}.pdf`;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

/** What a student (or the officer list) may see. Never the reviewer's identity, never file bytes. */
function publicCredential(c) {
  return {
    id: c._id,
    type: c.type,
    title: c.title,
    issuer: c.issuer,
    issueDate: c.issueDate,
    credentialId: c.credentialId,
    result: c.result,
    skill: c.skillId ? { id: c.skillId._id ?? c.skillId, name: c.skillId.name } : undefined,
    skillLevel: c.skillLevel,
    awardedLevel: c.status === "verified" ? c.awardedLevel : undefined,
    link: c.link,
    linkHost: c.linkHost,
    linkKnown: c.linkKnown,
    hasFile: Boolean(c.file?.sha256),
    fileName: c.file?.name,
    fileSize: c.file?.size,
    status: c.status,
    rejectionReason: c.rejectionReason,
    reviewedAt: c.reviewedAt,
    createdAt: c.createdAt,
  };
}

module.exports = {
  MAX_PDF_BYTES, MAX_CREDENTIALS_PER_STUDENT, KNOWN_HOSTS,
  classifyLink, isKnownHost, assertPdf, safePdfName, sha256, publicCredential,
};
