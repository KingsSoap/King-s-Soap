import { useState } from "react";
import AdminImageManager from "../components/AdminImageManager";
import supabase from "../supabaseClient";

const categoryOptions = [
  "Coconut Oil",
  "All Natural",
  "Organic",
  "Soap Dish",
]; // restrict category options for easier filtering when adding an item


//Function to add all fields to the database
function AdminCreateProduct( {
  onClose,
  onProductCreated,
}) {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");
  const [weight, setWeight] = useState("");
  const [category, setCategory] = useState([]);// change to array, maybe change how we are storing in the db?
  const [newImages, setNewImages] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const toggleCategory = (selectedCategory) => { // checks whether or not the category has already been selected 
  if (category.includes(selectedCategory)) { //means the category has already been selected
    setCategory(
      category.filter((category) => category !== selectedCategory) // Removes the selected category
    );
  } else {
    setCategory([...category, selectedCategory]); // sets the selected categories
  }
  };
  
  //Add all fields to the product table
  const dBAddItem = async () => {
    // Prevent another submission while processing or awaiting form reset
    if (loading || success) {
      return;
    }

    //Make sure all fields are valid
    setSuccess("");
    setError("");

    if (!productName.trim()) {
      setError("Product name is required");
      return;
    }

    const numericPrice = Number(price);

    if (
      price.trim() === "" ||
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      setError("Please enter a valid price of 0 or greater");
      return;
    }

    const numericStock = Number(stock);

    if (
      stock.trim() === "" ||
      !Number.isSafeInteger(numericStock) ||
      numericStock < 0
    ) {
      setError("Please enter a whole number of 0 or greater for inventory");
      return;
    }

    const numericWeight = Number(weight);

    if (
      weight.trim() === "" ||
      !Number.isFinite(numericWeight) ||
      numericWeight <= 0
    ) {
      setError("Please enter a valid weight greater than 0");
      return;
    }

    if (newImages.length === 0) {
      setError("Please upload at least one image for the product");
      return;
    }

    setLoading(true);

    //Form send to backend. FormData is used due to file upload
    const formData = new FormData();
      formData.append("productName", productName.trim());
      formData.append("price", String(numericPrice));
      formData.append("description", description);
      formData.append("stock", String(numericStock));
      formData.append("weight", String(numericWeight));
      formData.append("category", category.join(", ")); // split text for db handling


      //Loops through selected files and adds to formData
      newImages.forEach((image) => {
        formData.append("images", image);
      });

      try {
        // Get the administrator's current Supabase session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        // Stop if there is no valid session available
        if (sessionError || !session?.access_token) {
          setError("Your session has expired. Please sign in again.");
          return;
        }
        
        
      // Send the product information with the authentication token
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/products`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,

        });

        const result = await response.json();
        console.log("Backend response:", result);

        if (!response.ok) {
          setError(result.message || "Failed to add product");
          return;
        }

      
        // Show success message and clear form after a delay. Don't allow double submission
        setSuccess("Product added successfully!");

        //Refreshes product list on the page behind popup
        onProductCreated();

        
        setLoading(false);

        setTimeout(() => {
          setProductName("");
          setPrice("");
          setDescription("");
          setStock("");
          setWeight("");
          setCategory([]);//changed to set for array
          setNewImages([]);
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




  return (

    
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60">
    <div className="min-h-full flex justify-center pt-16 pb-8 md:pt-12 md:pb-12">
      <div className="w-full max-w-lg h-fit rounded-lg bg-[#C5AE98] p-8">

        {/* Closes the Add Product popup */}
        <button
          type="button"
          onClick={onClose}
          className="float-right text-2xl text-white cursor-pointer"
        >
          ×
        </button>

        <h2 className="text-4xl md:text-4xl text-center font-serif text-white">
          Add a New Product
        </h2>
      

        {/* Create a Product From Shop right box*/}
        <div className="w-full max-w-md mx-auto p-6 pb-12 rounded-2xl md:border md:border-white/30 md:shadow-lg bg-[#C5AE98]/20 backdrop-blur-lg md:mt-8 md:mb-8">
            
          <div className="space-y-4">

            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Product Name</label>
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {productName} onChange = {(e) => setProductName(e.target.value)}
                />
            </div>



            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Price</label>
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {price} onChange = {(e) => setPrice(e.target.value)}
                />
            </div>



            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Description</label>
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {description} onChange = {(e) => setDescription(e.target.value)}
                />
            </div>


            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Inventory</label>
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {stock} onChange = {(e) => setStock(e.target.value)}
                />
            </div>



             <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Weight</label>
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {weight} onChange = {(e) => setWeight(e.target.value)}
                />
            </div>



            <div>
            <label className="block text-lg md:text-xl font-serif text-white mb-2">
              Category tags
            </label>
            <details className="relative">
            <summary className="w-full bg-white rounded-lg px-3 py-2 text-gray-400 cursor-pointer list-none">
            {category.length > 0 ? category.join(", ") : "Select"} {/*Checks whether or not any categories have been selected, displays them */}
            </summary>
            <div className="absolute z-20 w-full mt-1 bg-white rounded-lg shadow-lg overflow-hidden">
              {/*Loop through every option in category options */}
            {categoryOptions.map((option) => (
           <label key={option} 
            className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 cursor-pointer"
           ><input 
            type="checkbox"
            checked={category.includes(option)}
            onChange={() => toggleCategory(option)} 
            className="h-4 w-4"
          />
            <span>{option}</span> {/*Display category name */}
            </label>
            ))}
            </div>
            </details>
            </div>


             <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">
                  Images
                  </label>

                {/*Passes array of currently selected images into component to display them and saves them using setNewImages*/}
                <AdminImageManager
                  newImages={newImages}
                  setNewImages={setNewImages}
                />
            </div>

          {/* Display success or error messages */}
            {error && (
               <p className="text-red-600 text-sm md:text-xl text-center">{error}</p>
            )}

            {success && (
               <p className="text-green-600 text-sm md:text-xl text-center">{success}</p>
            )}

            <button
              type="button"
              onClick={dBAddItem}
              disabled={loading || Boolean(success)}
              className={`mt-8 w-full py-2 md:h-10 rounded-lg bg-[#8B6B4A] border border-white/30 shadow-sm text-white text-md md:text-xl flex items-center justify-center transition ${
                loading || success
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:scale-105"
              }`}
            >
              {loading
                ? "Adding Item..."
                : success
                  ? "Item Added"
                  : "Add Item"}
            </button>


            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminCreateProduct;
