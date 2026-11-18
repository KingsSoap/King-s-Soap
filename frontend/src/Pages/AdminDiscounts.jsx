import { Link } from "react-router-dom";
import AdminHeader from "../components/AdminHeader";
import AddNewDiscount from "../components/AdminAddNewDiscount";
import { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import AdminCreateDiscount from "../components/AdminCreateDiscount";
import AdminUpdateDiscount from "../components/AdminUpdateDiscount";
import AdminDiscountTile from "../components/AdminDiscountTile";


function AdminDiscounts() {
  const [isAddDiscountOpen, setIsAddDiscountOpen] = useState(false);
  const [selectedDiscountId, setSelectedDiscountId] = useState(null); // Stores the discount selected from the list
  const [fetchError, setFetchError] = useState(""); //Holds an error message if loading discounts fails
  const [discounts, setDiscounts] = useState([]); //Stores the discounts displayed on this page
  const [loading, setLoading] = useState(true);


  //Load the discount list using the signed in user's session token
  const fetchDiscounts = async () => {
        setLoading(true);
        setFetchError("");

      try {
          const { data: { session }, error: sessionError } =
              await supabase.auth.getSession();

          if (sessionError || !session?.access_token) {
              throw new Error("Sign in to view discounts.");
          }

          const response = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/discounts`,
            {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
              },
          });

          const result = await response.json();

          if (!response.ok) {
              throw new Error(result.message || "Failed to load discounts.");
          }

          setDiscounts(result.discounts);
      } catch (error) {
          console.error("Could not load discounts:", error);
          setFetchError(error.message || "Failed to load discounts.");
      } finally {
          setLoading(false);
      }
  };


    //Fetch the discounts when page opens
    useEffect(() => {
        fetchDiscounts();
    }, []);


    return (
      <div className="min-h-screen pb-16"> {/* Container for the AdminProducts page */}
        
        <AdminHeader /> {/*Logo and profile button*/}
        
        <div className="flex flex-col justify-left mt-8 ml-8 md:ml-13 text-white mr-8 md:mr-13">

          <h1 className="text-3xl md:text-5xl font-serif">
            Your Discounts
          </h1>

          <p className="text-base font-serif md:text-xl leading-relaxed">
            Add, update, and manage your discounts
          </p>

            <AddNewDiscount //Add discount button 
              onAddDiscountClick={() => setIsAddDiscountOpen(true)}
            />
              

          {fetchError && (
            <p className="mt-6 text-red-300">
              {fetchError}
            </p>
          )}


        {/* Discount list (keep the Products page spacing and tile layout) */}
        <div className="flex flex-col justify-left mt-6">
            {loading && <p className="w-full py-10 text-center text-sm md:text-base text-white">Loading discounts...</p>}

            {!loading && !fetchError && discounts.length === 0 && (
                <p className="w-full py-10 text-center text-sm md:text-base text-white">
                    No discounts found. Click the + to get started.
                </p>
            )}

            {/* Show active discounts first and inactive discounts at the bottom. */}
            {!loading && !fetchError && [...discounts]
                .sort((a, b) => Number(b.is_active) - Number(a.is_active))
                .map((discount) => (
                    <AdminDiscountTile
                        key={discount.id}
                        discount={discount}
                        onClick={() => setSelectedDiscountId(discount.id)}
                    />
                ))}
        </div>


        </div>

        {/* Open the Add Discount form and refresh the list after a successful save */}
        {isAddDiscountOpen && (
            <AdminCreateDiscount
                onClose={() => setIsAddDiscountOpen(false)}
                onDiscountCreated={fetchDiscounts}
            />
        )}

        {/* Open the update form for the discount selected from the list. */}
        {selectedDiscountId && (
            <AdminUpdateDiscount
                discountId={selectedDiscountId}
                onClose={() => setSelectedDiscountId(null)}
                onDiscountChanged={fetchDiscounts}
            />
        )}

           
      </div>
  );
}

export default AdminDiscounts;
