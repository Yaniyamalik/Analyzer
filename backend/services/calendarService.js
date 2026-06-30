const { google } = require("googleapis");

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI // e.g. https://your-backend.onrender.com/api/calendar/oauth2callback
  );
}

/*
  Step 1: Generate the consent screen URL. The recruiter (you) authorizes once;
  the refresh token is then stored in env and reused for all future scheduling.
 */
function getAuthUrl() {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
}

/*
 Step 2: Exchange the ?code= from the OAuth redirect for tokens.
 The refresh_token returned here should be saved as GOOGLE_REFRESH_TOKEN in env.
 */
async function exchangeCodeForTokens(code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens; // contains refresh_token (save this!) and access_token
}

function getAuthorizedClient() {
  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

/*
  Creates a real Google Calendar event with an auto-generated Google Meet link,
 and invites the candidate as an attendee (they'll get a native Calendar invite).
 */
async function scheduleInterview({ candidateEmail, candidateName, startTime, durationMinutes = 30, jobTitle }) {
  const auth = getAuthorizedClient();
  const calendar = google.calendar({ version: "v3", auth });

  const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60000);

  const event = {
    summary: `Interview: ${candidateName} - ${jobTitle || "Role"}`,
    description: `Automated interview scheduling via Visl AI candidate screening platform.`,
    start: { dateTime: new Date(startTime).toISOString() },
    end: { dateTime: endTime.toISOString() },
    attendees: [{ email: candidateEmail }],
    conferenceData: {
      createRequest: {
        requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
    conferenceDataVersion: 1,
    sendUpdates: "all",
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.hangoutLink,
    htmlLink: response.data.htmlLink,
  };
}

module.exports = { getAuthUrl, exchangeCodeForTokens, scheduleInterview };
