import {useState} from "react";


function ContactForm({ isOpen, onClose}) {
    const[customerName, setCustomerName] = useState("");
    const[customerEmail, setCustomerEmail] = useState("");
    const[subject, setSubject] = useState("");
    const[message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);



     const dBAddItem = async () => {


    //Make sure all fields are valid
    setSuccess("");
    setError("");

    if (!customerName) {
      setError("Please enter your name");
      return;
    }

    //Check email follows basic format
    const emailPatter = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPatter.test(customerEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!subject) {
      setError("Please enter a subject field");
      return;
    }

    if (!message) {
      setError("Please enter a message");
      return;
    }

    setLoading(true);

    //Form send to backend. FormData is used due to file upload
    const newMessage = {
      customerName: customerName,
      customerEmail: customerEmail,
      subject: subject,
      message: message,
    };

      try {
        const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newMessage),
        });

        const result = await response.json();
        console.log("Backend response:", result);

        if (!response.ok) {
          setError(result.message || "Failed to send message");
          return;
        }

      
        // Show success message and clear form after a delay. Don't allow double submission
        setSuccess("Message sent successfully!");

        setLoading(false);

        setTimeout(() => {
          setCustomerName("");
          setCustomerEmail("");
          setSubject("");
          setMessage("");
          setSuccess("");
        }, 3000);
        
      } catch (err) {
        console.error("Fetch error:", err);
        setError("Could not reach backend");
      }
      finally {
      setLoading(false);
    }
  
};




    //Don't display form when closed
    if (!isOpen) {
        return null;
    }



    return(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-left">
        <div className="w-full max-w-lg rounded-lg bg-[#C5AE98] p-8">
            <button
            type="button"
            onClick={onClose}
            className="float-right text-2xl text-white cursor-pointer"
            >
            ×
            </button>

            <h2 className="text-4xl md:text-4xl text-center font-serif text-white">
            Contact Us
            </h2>
            
            <div className="w-full max-w-md mx-auto px-6 py-4 pb-4 md:pb-12 rounded-2xl md:border md:border-white/30 md:shadow-lg bg-[#C5AE98]/20 backdrop-blur-lg md:mt-8 md:mb-8"> 
            <div className="space-y-4 font-sans">

                <div>

                <label className="block text-lg md:text-xl font-serif text-white mb-2">
                    Name
                </label>

                <input
                    placeholder="Value"
                    className="w-full bg-white rounded-lg px-3 py-2 text-gray-700 placeholder-gray-400 outline-none"
                    value = {customerName} onChange = {(e) => setCustomerName(e.target.value)}
                />

                </div>

                <div>

                <label className="block text-lg md:text-xl font-serif text-white mb-2">
                    Email
                </label>

                <input
                    placeholder="Value"
                    className="w-full bg-white rounded-lg px-3 py-2 text-gray-700 placeholder-gray-400 outline-none"
                    value = {customerEmail} onChange = {(e) => setCustomerEmail(e.target.value)}
                />

                </div>

                <div>

                <label className="block text-lg md:text-xl font-serif text-white mb-2">
                    Subject
                </label>

                <input
                    placeholder="Value"
                    className="w-full bg-white rounded-lg px-3 py-2 text-gray-700 placeholder-gray-400 outline-none"
                    value = {subject} onChange = {(e) => setSubject(e.target.value)}
                />

                </div>

                <div>

                <label className="block text-lg md:text-xl font-serif text-white mb-2">
                    Message
                </label>

                <textarea
                    placeholder="Enter your message"
                    rows="4"
                    className="w-full bg-white rounded-lg px-3 py-2 text-gray-700 placeholder-gray-400 outline-none resize-none"
                    value = {message} onChange = {(e) => setMessage(e.target.value)}
                />

                </div>
                
                {/* Display success or error messages */}
                {error && (
                <p className="text-red-600 text-base md:text-xl text-center">{error}</p>
                )}

                {success && (
                <p className="text-green-600 text-base md:text-xl text-center">{success}</p>
                )}

                <button onClick ={dBAddItem}
                disabled={loading}
                className={`mt-8 w-full py-2 md:h-10 rounded-lg bg-[#8B6B4A] backdrop-blur-lg border border-white/30 shadow-sm text-white text-base md:text-xl flex items-center justify-center hover:scale-105 cursor-pointer transition ${
                    loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:scale-105"
                }`}
                >
                    {loading ? "Sending Message..." : "Send Message"
                }
            
                </button>



            </div>
            </div>
        </div>
        </div>
    );
}


export default ContactForm;