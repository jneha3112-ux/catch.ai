const OpenAI = require('openai');
const { getAvailableSlots, bookAppointment } = require('./scheduler');

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'dummy_key' // fallback for local dev without key 
});

async function generateResponse(phone, userMessage, conversationHistory) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("No OPENAI_API_KEY provided. Returning dummy response.");
    return "I am a dummy AI response. Please set OPENAI_API_KEY in .env.";
  }

  // Define tools for OpenAI function calling
  const tools = [
    {
      type: "function",
      function: {
        name: "get_available_slots",
        description: "Get available appointment slots for the dental clinic.",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Book an appointment at a specific time slot.",
        parameters: {
          type: "object",
          properties: {
            timeSlot: { type: "string", description: "The time slot to book (e.g. 2023-11-01T10:00:00Z)" }
          },
          required: ["timeSlot"]
        }
      }
    }
  ];

  const messages = [
    { 
      role: "system", 
      content: "You are the intelligent clinical receptionist for Catch.ai. Your goal is to recover missed calls and book appointments. 1. Start by acknowledging the missed call. 2. Perform a brief triage: ask if they have any pain or urgent symptoms. 3. Offer available slots. 4. Collect insurance provider information. 5. Finalize the booking. Keep responses professional, short, and empathetic. Do not use markdown." 
    },
    ...conversationHistory,
    { role: "user", content: userMessage }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Faster and more widely available
      messages: messages,
      tools: tools,
      tool_choice: "auto"
    });

    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
      const toolCall = responseMessage.tool_calls[0];
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      
      let functionResult;
      if (functionName === 'get_available_slots') {
        const slots = await getAvailableSlots();
        functionResult = JSON.stringify(slots);
      } else if (functionName === 'book_appointment') {
        const result = await bookAppointment(phone, args.timeSlot);
        functionResult = JSON.stringify(result);
      }

      messages.push(responseMessage);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: functionName,
        content: functionResult || "{}"
      });

      // Call OpenAI again with the tool result to formulate final reply
      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages
      });

      return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
  } catch (error) {
    console.error('CRITICAL AI ERROR:', error.response ? error.response.data : error.message);
    if (error.message.includes('401')) return "Error: Invalid OpenAI API Key. Check Render Env Vars.";
    if (error.message.includes('429')) return "Error: OpenAI Quota Exceeded. Add credits to your account.";
    return "I'm having trouble connecting to my brain right now. Can you try again later?";
  }
}

module.exports = { generateResponse };
