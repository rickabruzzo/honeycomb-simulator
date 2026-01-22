export const mockResponses: Record<string, string[]> = {
  ICEBREAKER: [
    "Hey. Just doing a quick lap between talks. What’s this booth about?",
    "Yeah, I’ve got a minute. What are you focused on here?",
    "Hi. I’m trying not to get pulled into a pitch — what do you all do?"
  ],

  EXPLORATION: [
    "I’m an SRE. Mostly focused on reliability and incident response right now.",
    "We run a pretty standard stack — metrics, logs, some tracing. It mostly works.",
    "My day is a lot of on-call, reviews, and trying to reduce alert noise."
  ],

  PAIN_DISCOVERY: [
    "Honestly, alerts are the worst part. We get paged for symptoms, not causes.",
    "We had an outage recently where everything looked fine until users started complaining.",
    "It’s frustrating — we spend more time figuring out where to look than actually fixing things."
  ],

  SOLUTION_FRAMING: [
    "That sounds interesting, but I’m skeptical of anything that promises a silver bullet.",
    "How would that help during an incident, not just after?",
    "What’s the learning curve for engineers?"
  ],

  OUTCOME: [
    "I could do a quick demo if it’s focused.",
    "This is interesting — can we follow up after the conference?",
    "I should get to my next talk, but thanks."
  ]
};