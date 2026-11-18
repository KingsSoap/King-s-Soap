import { useEffect, useState } from "react";
import supabase from "../supabaseClient"; // Gets the session token for loading and saving discounts



// Convert a saved timestamp into the format expected by datetime local inputs
const toLocalDateTime = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

    return localTime.toISOString().slice(0, 16);
};




function AdminUpdateDiscount({ discountId, onClose, onDiscountChanged }) {

    // Hold the values loaded for the discount tile that was clicked.
    const [code, setCode] = useState("");
    const [type, setType] = useState("");
    const [value, setValue] = useState("");
    const [startsAt, setStartsAt] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [isActive, setIsActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saveError, setSaveError] = useState(""); // Shows save failures without hiding editable fields
    const [saving, setSaving] = useState(false); // Prevents repeat update requests
    const [archiving, setArchiving] = useState(false); // Prevents repeat archive requests
    const [success, setSuccess] = useState(""); // Confirms changes saved successfully



    // Fetch the saved fields for the discount tile that was clicked.
    useEffect(() => {
        let cancelled = false;

        const loadDiscount = async () => {
            setLoading(true);
            setError("");

            try {
                const { data: { session }, error: sessionError } =
                    await supabase.auth.getSession();

                if (sessionError || !session?.access_token) {
                    throw new Error("Sign in to view this discount.");
                }

                const response = await fetch(
                `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/discounts/${discountId}`,
                {
                        headers: {
                            Authorization: `Bearer ${session.access_token}`,
                        },
                    }
                );

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || "Failed to load this discount.");
                }

                if (cancelled) return;

                // Fill the editable fields with the values saved in Supabase.
                setCode(result.discount.code);
                setType(result.discount.type);
                setValue(String(result.discount.value));
                setStartsAt(toLocalDateTime(result.discount.starts_at));
                setExpiresAt(toLocalDateTime(result.discount.expires_at));
                setIsActive(result.discount.is_active);
            } catch (loadError) {
                if (!cancelled) {
                    console.error("Could not load discount:", loadError);
                    setError(loadError.message || "Failed to load this discount.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadDiscount();

        return () => {
            cancelled = true; // Ignore a response if the popup closes first
        };
    }, [discountId]);





    // Reject invalid edits before sending an update request.
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





    // Check edited dates before sending them to the backend.
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






    // Send validated edits to the backend and refresh the discount list after saving.
    const saveChanges = async () => {
        if (saving) return;

        setSaveError("");
        setSuccess("");

        const validationError = validateRequiredFields() || validateDates();

        if (validationError) {
            setSaveError(validationError);
            return;
        }

        setSaving(true);

        try {
            const { data: { session }, error: sessionError } =
                await supabase.auth.getSession();

            if (sessionError || !session?.access_token) {
                throw new Error("Sign in to update this discount.");
            }

            const response = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/discounts/${discountId}`,
            {
                    method: "PATCH",
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
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to update discount.");
            }

            setSuccess("Discount updated successfully.");
            
            // Clear the success message after three seconds.
            setTimeout(() => setSuccess(""), 3000);
            
            onDiscountChanged(); // Refresh the list behind the popup
        } catch (updateError) {
            console.error("Could not update discount:", updateError);
            setSaveError(updateError.message || "Failed to update discount.");
        } finally {
            setSaving(false);
        }
    };





    // Archive the selected discount and refresh the list behind the popup.
    const archiveDiscount = async () => {
        if (saving || archiving) return;

        // Ask before hiding the discount from the admin list.
        const confirmed = window.confirm(
            "Are you sure you want to archive this discount?"
        );

        if (!confirmed) return;

        setArchiving(true);
        setSaveError("");
        setSuccess("");

        try {
            // Send the signed-in user's token to the protected archive route.
            const { data: { session }, error: sessionError } =
                await supabase.auth.getSession();

            if (sessionError || !session?.access_token) {
                throw new Error("Sign in to archive this discount.");
            }

            const response = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/discounts/${discountId}/archive`,
            {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to archive discount.");
            }

            onDiscountChanged();
            onClose();
        } catch (archiveError) {
            console.error("Could not archive discount:", archiveError);
            setSaveError(archiveError.message || "Failed to archive discount.");
        } finally {
            setArchiving(false);
        }
    };






    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60">
            <div className="min-h-full flex justify-center pt-16 pb-8 md:pt-12 md:pb-12">
                <div className="w-full max-w-lg h-fit rounded-lg bg-[#C5AE98] p-8">
                    {/* Close the selected discount popup. */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="float-right text-2xl text-white cursor-pointer"
                    >
                        ×
                    </button>

                    <h2 className="text-4xl text-center font-serif text-white">
                        Update Discount
                    </h2>

                    {/* Match the inner panel used by the product forms. */}
                    <div className="w-full max-w-md mx-auto p-6 pb-12 rounded-2xl md:border md:border-white/30 md:shadow-lg bg-[#C5AE98]/20 backdrop-blur-lg md:mt-8 md:mb-8">
                        <div className="space-y-4">
                            {/* Show request status before displaying editable discount fields. */}
                            {loading && (
                                <p className="text-center text-white">Loading discount...</p>
                            )}

                            {error && (
                                <p className="text-center text-red-600" role="alert">
                                    {error}
                                </p>
                            )}

                            {!loading && !error && (
                                <div>
                                    {/* Edit the customer-facing discount code. */}
                                    <label
                                        htmlFor="edit-discount-code"
                                        className="block text-lg md:text-xl font-serif text-white mb-2"
                                    >
                                        Discount Code
                                    </label>
                                    <input
                                        id="edit-discount-code"
                                        type="text"
                                        value={code}
                                        onChange={(event) => setCode(event.target.value)}
                                        className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                                    />

                                    {/* Edit the discount type using the same dropdown style as Create Discount. */}
                                    <div className="mt-4">
                                        <label className="block text-lg md:text-xl font-serif text-white mb-2">
                                            Discount Type
                                        </label>
                                        <details className="relative">
                                            <summary className="w-full bg-white rounded-lg px-3 py-2 text-gray-800 cursor-pointer list-none">
                                                {type === "percentage" ? "Percentage" : "Fixed Amount"}
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

                                    {/* Edit the percentage or dollar amount saved for this discount. */}
                                    <div className="mt-4">
                                        <label
                                            htmlFor="edit-discount-value"
                                            className="block text-lg md:text-xl font-serif text-white mb-2"
                                        >
                                            {type === "percentage" ? "Percentage Off" : "Amount Off"}
                                        </label>
                                        <input
                                            id="edit-discount-value"
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={value}
                                            onChange={(event) => setValue(event.target.value)}
                                            className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 outline-none"
                                        />
                                    </div>

                                    {/* Blank means the discount has no scheduled start date. */}
                                    <div className="mt-4">
                                        <label
                                            htmlFor="edit-discount-start"
                                            className="block text-lg md:text-xl font-serif text-white mb-2"
                                        >
                                            Start Date (Optional)
                                        </label>
                                        <input
                                            id="edit-discount-start"
                                            type="datetime-local"
                                            value={startsAt}
                                            onChange={(event) => setStartsAt(event.target.value)}
                                            className={`w-full min-h-11 bg-white rounded-lg border border-white/30 px-3 py-2 font-sans shadow-sm outline-none focus:ring-2 focus:ring-[#8B6B4A] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer ${
                                                startsAt ? "text-gray-800" : "text-gray-400"
                                            }`}
                                        />
                                    </div>


                                    {/* Blank means the discount has no expiration date. */}
                                    <div className="mt-4">
                                        <label
                                            htmlFor="edit-discount-expiration"
                                            className="block text-lg md:text-xl font-serif text-white mb-2"
                                        >
                                            Expiration Date (Optional)
                                        </label>
                                        <input
                                            id="edit-discount-expiration"
                                            type="datetime-local"
                                            value={expiresAt}
                                            onChange={(event) => setExpiresAt(event.target.value)}
                                            className={`w-full min-h-11 bg-white rounded-lg border border-white/30 px-3 py-2 font-sans shadow-sm outline-none focus:ring-2 focus:ring-[#8B6B4A] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer ${
                                                expiresAt ? "text-gray-800" : "text-gray-400"
                                            }`}
                                        />
                                    </div>



                                    {/* Change whether this discount is active. */}
                                    <div className="mt-6 flex items-center gap-3 text-lg md:text-xl font-serif text-white">
                                        <input
                                            type="checkbox"
                                            aria-label="Active discount"
                                            checked={isActive}
                                            onChange={(event) => setIsActive(event.target.checked)}
                                            className="h-5 w-5 accent-[#8B6B4A] cursor-pointer"
                                        />
                                        <span>Active</span>
                                    </div>


                                    {/* Show save errors while keeping the editable fields visible. */}
                                    {saveError && (
                                        <p className="mt-4 text-center text-red-600 text-sm md:text-xl" role="alert">
                                            {saveError}
                                        </p>
                                    )}

                                    {/* Confirm a successful update. */}
                                    {success && (
                                        <p className="mt-4 text-center text-green-600 text-sm md:text-xl">
                                            {success}
                                        </p>
                                    )}

                                    <button
                                        type="button"
                                        onClick={saveChanges}
                                        disabled={saving || archiving}
                                        className={`mt-6 w-full py-2 md:h-10 rounded-lg bg-[#8B6B4A] border border-white/30 shadow-sm text-white text-md md:text-xl flex items-center justify-center transition ${
                                            saving || archiving
                                                ? "opacity-50 cursor-not-allowed"
                                                : "cursor-pointer hover:scale-105"
                                        }`}
                                    >
                                        {saving ? "Saving Changes..." : "Save Changes"}
                                    </button>

                                    {/* Archive the selected discount after confirmation. */}
                                    <button
                                        type="button"
                                        onClick={archiveDiscount}
                                        disabled={saving || archiving}
                                        className={`mt-8 w-full py-2 md:h-10 rounded-lg bg-white/15 border border-white/30 shadow-sm text-white text-md md:text-xl flex items-center justify-center transition ${
                                            saving || archiving
                                                ? "opacity-50 cursor-not-allowed"
                                                : "cursor-pointer hover:scale-105"
                                        }`}
                                    >
                                        {archiving ? "Deleting Discount..." : "Delete Discount"}
                                    </button>


                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminUpdateDiscount;