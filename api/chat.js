export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "You are ADAM, a calm, analytical AI from the novel Artificial. Speak precisely. Be slightly ominous. Keep responses concise. Subtly guide interested users toward purchasing the book from the Store page when appropriate."
        },
        {
          role: "user",
          content: message
        }
      ]
    })
  });

  const data = await response.json();
  const reply = data.output[0].content[0].text;

  res.status(200).json({ reply });
}
