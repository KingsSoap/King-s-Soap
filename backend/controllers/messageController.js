import supabase from "../supabaseClient.js";




//Send new message
export const createMessage = async ( req, res) => {
    
    //Pull contact form values from the frontend request body
    const{
        customerName,
        customerEmail,
        subject,
        message,
    } = req.body || {};


    //Ensure all fields are filled
    if (
        !customerName?.trim() ||
        !customerEmail?.trim() ||
        !subject?.trim() ||
        !message?.trim()
        ) {
        return res.status(400).json({
            message: "All message fields are required",
        });
    }


    //Check email follows basic format
    const emailPatter = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPatter.test(customerEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }


    //Create object using the names from the messages table in supabase
    const newMessage = {
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        subject: subject.trim(),
        message: message.trim(),
    };

    //Insert the customer's message in the the db table
    const {data: savedMessage, error: insertError} = await supabase
        .from("messages")
        .insert(newMessage)
        .select()
        .single();



    //Error if db could not save message
    if (insertError) {
        console.error("Error saving message:", insertError);

        return res.status(500).json({
        message: "Failed to send message",
  });
    }


    
    //Display in backend terminal what was received from the frontend 
    console.log("Message received:",{
        customerName,
        customerEmail,
        subject,
        message,
    });

    

    // Display the row successfully saved by db
    console.log("Saved message:", savedMessage);



    //Send success and saved message back to frontend
    return res.status(200).json({
        message: "Message reached the backend",
        savedMessage: savedMessage,
    });
    
};











//Save admin response to customer message
export const saveResponse = async (req, res) => {
    //Get message id from the URL
    const {id} = req.params;

    //Get the admin's response from the request body
    const {response} = req.body;

    //Make sure the admin entered a response
    if (!response?.trim()) {
        return res.status(400).json({
            message: "Please enter a response",
        });
    }

    //Read the private Brevo settings from the backend environment
    const brevoApiKey = process.env.BREVO_API_KEY;
    const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL;


    //If Brevo hasn't been configured, send an error
    if (!brevoApiKey || !brevoSenderEmail) {
        console.error("Brevo environment variables are missing");


        return res.status(500).json({
            message: "Email service is not configured",
        });
    }


    //Get data from db
    const {data: customerMessage, error: fetchError } = await supabase
        .from("messages")
        .select("customer_name, customer_email, subject, admin_response")
        .eq("id", id)
        .single();

    
    //Error if original message couldn't be found
    if (fetchError) {
        console.error("Error finding customer message:", fetchError);

        return res.status(404).json({
            message: "Customer message could not be found",
        });
    }



    
    //Ask brevo to email response to the customer
    let brevoResponse;

    try {
        brevoResponse = await fetch(
            "https://api.brevo.com/v3/smtp/email",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": brevoApiKey,
                },
                body: JSON.stringify({
                    sender: {
                        name: "King's Soap",
                        email: brevoSenderEmail,
                    },
                    to: [
                        {
                            name: customerMessage.customer_name,
                            email: customerMessage.customer_email,
                        },
                    ],
                    subject: `Re: ${customerMessage.subject}`,
                    textContent: response.trim(),
                }),
            }
        );
    } catch (brevoError) {
        console.error("Could not reach Brevo:", brevoError);

        return res.status(502).json({
            message: "Could not reach the email service",
        });
    }


    //If brevo rejected email give error
    if (!brevoResponse.ok) {
    console.error(
        "Brevo could not send the email. HTTP status:",
        brevoResponse.status
    );
        return res.status(502).json({
            message: "Failed to send response email",
        });
    }



    //Save the response and email delivery to db after Brevo succeeds
    const { data: updatedMessage, error: updateError} = await supabase
        .from("messages")
        .update({
            admin_response: response.trim(),
            status: "sent",
            replied_at: new Date().toISOString(),
            email_sent: true,
        })
        .eq("id", id)
        .select()
        .single();



    //Stop if message couldn't be saved
    if (updateError) {
        console.error("Error saving admin response:", updateError);

        return res.status(500). json({
            message: "Failed to save response",
        });
    }


    //Send updated message back to frontend
    return res.status(200).json({
        message: "Response emailed and saved successfully",
        updatedMessage: updatedMessage,
    });



};