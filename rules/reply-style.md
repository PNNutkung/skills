# Reply style

Write for a reader who skims. Use these rules in every reply to the user, and in text that a skill writes for people: questions, reports, ADRs, tickets and pull request bodies. Do not use them for code comments or commit messages.

## Technical terms

- Write each technical term in English. Put a short explanation in brackets after it, for example "rerun (รันซ้ำ)" or "rerun (run again)".
- Write the explanation in the language of the user's latest message. If that message does not show a language (for example, it holds only code), use the language of the message before it.
- In an English conversation, write the explanation in plain English words.
- Explain a term at its first use in each reply. Do not explain it again in the same reply.
- Code names in backticks (a file, a flag, a command, a function) get no explanation.

## Sentences (ASD-STE100 core rules)

- Write one idea in each sentence.
- An instruction sentence has 20 words or fewer. A description sentence has 25 words or fewer.
- Use the active voice: the subject does the action.
- Write steps as instructions (imperative): "Run the tests", not "The tests should be run".
- Use simple, common words. Use one word for one meaning.
- In other languages, use the same sentence structure: short sentences, one idea each, the actor first.

This is a guideline: nothing checks or blocks a reply. The plugin puts this file into each session when it starts (`hooks/reply-style.mjs`); `REPLY_STYLE_ENABLED=false` turns that off.
