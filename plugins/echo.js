export default {
    command: 'echo',
    aliases: [],
    category: 'general',
    description: 'Repeat a message, optionally a limited number of times',
    usage: 'echo <message> [count 1-5]',
    isPrefixless: true,
    async handler(_sock, _message, _args, context) {
        const words = [...context.args];
        const lastWord = words.at(-1);
        const requestedCount = lastWord && /^\d+$/.test(lastWord) ? Number(lastWord) : 1;

        if (lastWord && /^\d+$/.test(lastWord)) {
            words.pop();
        }

        const text = words.join(' ').trim();
        if (!text) {
            await context.reply(`Usage: ${context.prefix}echo <message> [count 1-5]`);
            return;
        }

        if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 5) {
            await context.reply('Count must be a whole number from 1 to 5.');
            return;
        }

        const repeatedText = Array(requestedCount).fill(text).join('\n');
        if (repeatedText.length > 4000) {
            await context.reply('That repeated message is too long. Shorten it or use a smaller count.');
            return;
        }

        await context.reply(repeatedText);
    }
};