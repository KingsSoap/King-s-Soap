import { useState } from "react";
import supabase from "../supabaseClient"; // Gets the session token for the discount API


//Copied AdminCreateProduct

function AdminCreateDiscount({ onClose, onDiscountCreated }) {
    const [code, setCode] = useState(""); // Holds the customer-facing discount code
    const [type, setType] = useState(""); //Empty until selected
    const [value, setValue] = useState("");
    const [startsAt, setStartsAt] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [error, setError] = useState(""); // Shows validation or save errors
    const [success, setSuccess] = useState(""); // Confirms a discount was saved
    const [saving, setSaving] = useState(false); // Prevents repeat submissions while saving




    // Check the required form fields before sending a request to the backend.
    const validateRequiredFields = () => {
        if (!/^[A-Z0-9]+$/.test(code.trim().toUpperCase())) {
            return "Enter a discount code using letters and numbers only.";
        }

        if (type !== "percentage" && type !== "fixed") {
            return "Select a discount type.";
        }

        const numericValue = Number(value);

        if (!Number.isFinite(numericValue) || numericValue <= 0) {
            return "Enter a discount value greater than zero.";
        }

        if (!/^\d+(\.\d{1,2})?$/.test(value)) {
            return "Enter a value with no more than two decimal places.";
        }

        if (type === "percentage" && numericValue > 100) {
            return "A percentage discount cannot exceed 100%.";
        }

        return "";
    };




    //Check date order before sending the form to the backend.
    const validateDates = () => {
        const start = startsAt ? new Date(startsAt) : null;
        const expiration = expiresAt ? new Date(expiresAt) : null;

        if (start && Number.isNaN(start.getTime())) {
            return "Enter a valid start date.";
        }

        if (expiration && Number.isNaN(expiration.getTime())) {
            return "Enter a valid expiration date.";
        }

        if (expiration && expiration.getTime() <= Date.now()) {
            return "The expiration date must be in the future.";
        }

        if (start && expiration && expiration <= start) {
            return "The expiration date must come after the start date.";
        }

        return "";
    };
        
    

    //Validate the form, then ask the backend to create the Stripe and db discount
    const saveDiscount = async () => {
        if (saving) return;

        setError("");
        setSuccess("");

        
        const validationError = validateRequiredFields() || validateDates();

        if (validationError) {
            setError(validationError);
            return;
        }

        setSaving(true);

        try {
            const { data: { session }, error: sessionError } =
                await supabase.auth.getSession();

            if (sessionError || !session?.access_token) {
                throw new Error("Sign in to create a discount.");
            }

            const response = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/discounts`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    code: code.trim().toUpperCase(),
                    type,
                    value: Number(value),
                    starts_at: startsAt ? new Date(startsAt).toISOString() : null,
                    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
                    is_active: isActive,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to create discount.");
            }

            setSuccess("Discount created successfully.");

            // Clear the success message and reset the form after three seconds.
            setTimeout(() => {
                setSuccess("");
                setCode("");
                setType("");
                setValue("");
                setStartsAt("");
                setExpiresAt("");
                setIsActive(true);
            }, 3000);

            onDiscountCreated(); // Reload the list behind the popup
        } catch (saveError) {
            console.error("Could not create discount:", saveError);
            setError(saveError.message || "Failed to create discount.");
        } finally {
            setSaving(false);
        }
    };


    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60">
            <div className="min-h-full flex justify-center pt-16 pb-8 md:pt-12 md:pb-12">
                <div className="w-full max-w-lg h-fit rounded-lg bg-[#C5AE98] p-8">
                    {/* Close the Add Discount popup. */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="float-right text-2xl text-white cursor-pointer"
                    >
                        ×
                    </button>

                    <h2 className="text-4xl md:text-4xl text-center font-serif text-white">
                        Add a New Discount
                    </h2>

                    {/* Keep the same inner panel as the Add Product form. */}
                    <div className="w-full max-w-md mx-auto p-6 pb-12 rounded-2xl md:border md:border-white/30 md:shadow-lg bg-[#C5AE98]/20 backdrop-blur-lg md:mt-8 md:mb-8">
                        <div className="space-y-4">
                            {/* Customer-facing discount code. */}
                                <div>
                                    <label
                                        htmlFor="discount-code"
                                        className="block text-lg md:text-xl font-serif text-white mb-2"
                                    >
                                        Discount Code
                                    </label>
                                    <input
                                        id="discount-code"
                                        type="text"
                                        placeholder="Value"
                                        value={code}
                                        onChange={(event) => setCode(event.target.value)}
                                        className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                                    />
                                </div>

                                {/* Choose how the discount value will be applied */}
                                <div>
                                    <label className="block text-lg md:text-xl font-serif text-white mb-2">
                                        Discount Type
                                    </label>
                                    <details className="relative">

                                        <summary
                                            className={`w-full bg-white rounded-lg px-3 py-2 cursor-pointer list-none ${
                                                type ? "text-gray-800" : "text-gray-400"
                                            }`}
                                        >
                                            {type === "percentage" ? "Percentage" : type === "fixed" ? "Fixed Amount" : "Select"}
                                        </summary>

                                        <div className="absolute z-20 w-full mt-1 bg-white rounded-lg shadow-lg overflow-hidden">
                                            {[
                                                { value: "percentage", label: "Percentage" },
                                                { value: "fixed", label: "Fixed Amount" },
                                            ].map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={(event) => {
                                                        setType(option.value);
                                                        event.currentTarget.closest("details").open = false;
                                                    }}
                                                    className="block w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-100 cursor-pointer"
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </details>
                                </div>

                                {/* Show the unit that matches the selected discount type. */}
                                <div>
                                    <label
                                        htmlFor="discount-value"
                                        className="block text-lg md:text-xl font-serif text-white mb-2"
                                    >
                                        {type === "percentage" ? "Percentage Off" : type === "fixed" ? "Amount Off" : "Amount"}
                                    </label>
                                    <input
                                        id="discount-value"
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        placeholder={type === "percentage" ? "10%" : type === "fixed" ? "$10.00" : "Value"}
                                        value={value}
                                        onChange={(event) => setValue(event.target.value)}
                                        className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                                    />
                                </div>

                                {/* Leave blank if the discount should be available immediately. */}
                                <div>
                                    <label
                                        htmlFor="discount-start"
                                        className="block text-lg md:text-xl font-serif text-white mb-2"
                                    >
                                        Start Date (Optional)
                                    </label>
                                    <input
                                        id="discount-start"
                                        type="datetime-local"
                                        value={startsAt}
                                        onChange={(event) => setStartsAt(event.target.value)}
                                        className={`w-full min-h-11 bg-white rounded-lg border border-white/30 px-3 py-2 font-sans shadow-sm outline-none focus:ring-2 focus:ring-[#8B6B4A] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer ${
                                            startsAt ? "text-gray-800" : "text-gray-400"
                                        }`}                                    />
                                </div>

                                {/* Leave blank if the discount should not expire. */}
                                <div>
                                    <label
                                        htmlFor="discount-expiration"
                                        className="block text-lg md:text-xl font-serif text-white mb-2"
                                    >
                                        Expiration Date (Optional)
                                    </label>
                                    <input
                                        id="discount-expiration"
                                        type="datetime-local"
                                        value={expiresAt}
                                        onChange={(event) => setExpiresAt(event.target.value)}
                                        className={`w-full min-h-11 bg-white rounded-lg border border-white/30 px-3 py-2 font-sans shadow-sm outline-none focus:ring-2 focus:ring-[#8B6B4A] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer ${
                                            expiresAt ? "text-gray-800" : "text-gray-400"
                                        }`}                                    />
                                </div>

                                {/* Allow the admin to save a discount as inactive. */}
                                <div className="flex mt-6 items-center gap-3 text-lg md:text-xl font-serif text-white">
                                    <input
                                        type="checkbox"
                                        aria-label="Active discount"
                                        checked={isActive}
                                        onChange={(event) => setIsActive(event.target.checked)}
                                        className="h-5 w-5 accent-[#8B6B4A] cursor-pointer"
                                    />
                                    <span>Active</span>
                                </div>

                                {/* Show validation or backend errors without reporting a false success. */}
                                {error && (
                                    <p className="text-red-600 text-sm md:text-xl text-center" role="alert">
                                        {error}
                                    </p>
                                )}

                                {/* Confirm only a successful backend save. */}
                                {success && (
                                    <p className="text-green-600 text-sm md:text-xl text-center">
                                        {success}
                                    </p>
                                )}

                                <button
                                    type="button"
                                    onClick={saveDiscount}
                                    disabled={saving || Boolean(success)}
                                    className={`mt-6 w-full py-2 md:h-10 rounded-lg bg-[#8B6B4A] border border-white/30 shadow-sm text-white text-md md:text-xl flex items-center justify-center transition ${
                                        saving || success
                                            ? "opacity-50 cursor-not-allowed"
                                            : "cursor-pointer hover:scale-105"
                                    }`}
                                >
                                    {saving ? "Adding Discount..." : "Add Discount"}
                                </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminCreateDiscount;