const IDENTITY_QUESTION_PATTERN =
    /^\s*(?:(?:hi|hello|hey)[,!]?\s+)?(?:are you|is (?:this|it|the bot|this bot))\s+(?:(?:a|an|the)\s+)?(?:ai(?:\s+(?:language model|assistant|chatbot))?|artificial intelligence|bot|robot|human|(?:real )?person|language model)\s*[?.!]*\s*$/i;

const IDENTITY_REPLY =
    'Yeah, I’m an AI assistant, but I can still chat naturally with you.';

export function getDirectAiIdentityReply(text) {
    if (typeof text !== 'string' || !IDENTITY_QUESTION_PATTERN.test(text))
        return undefined;
    return IDENTITY_REPLY;
}