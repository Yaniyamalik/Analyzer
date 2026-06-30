const axios = require("axios");
const pdfParse = require("pdf-parse");

/* Converts a Google Drive "view" share link into a direct-download link.
  Handles formats like:
   https://drive.google.com/file/d/<ID>/view?usp=sharing
 */
function toDirectDriveLink(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url; // fallback: assume it's already a direct link
}

/*Downloads a resume from a Drive (or direct) link and extracts text.
 Returns { text, error }.
 */
async function downloadAndParseResume(driveUrl) {
  try {
    const directUrl = toDirectDriveLink(driveUrl);
    const response = await axios.get(directUrl, {
      responseType: "arraybuffer",
      maxRedirects: 10,
      timeout: 30000,
      headers: { "User-Agent": "Mozilla/5.0 (VislAIScreener/1.0)" },
    });

    const contentType = response.headers["content-type"] || "";
    const buffer = Buffer.from(response.data);

    // Google sometimes returns an HTML "confirm download" page for large files.
    // Detect that and bail gracefully rather than parsing garbage.
    const sniff = buffer.slice(0, 200).toString("utf-8").toLowerCase();
    if (sniff.includes("<!doctype html") || sniff.includes("<html")) {
      return {
        text: "",
        error:
          "Drive returned an HTML confirmation page instead of the file (likely a large-file virus-scan warning or permission issue). Ensure the file is shared as 'Anyone with the link can view'.",
      };
    }

    if (contentType.includes("pdf") || buffer.slice(0, 4).toString() === "%PDF") {
      const parsed = await pdfParse(buffer);
      return { text: parsed.text.trim(), error: null };
    }

    // Fallback: treat as plain text
    return { text: buffer.toString("utf-8").trim(), error: null };
  } catch (err) {
    return { text: "", error: err.message || "Failed to download/parse resume" };
  }
}

module.exports = { downloadAndParseResume, toDirectDriveLink };
