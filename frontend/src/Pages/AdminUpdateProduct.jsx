import {useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { FiEdit2 } from "react-icons/fi";
import AdminImageManager from "../components/AdminImageManager";
const categoryOptions = [
  "Coconut Oil",
  "All Natural",
  "Organic",
  "Soap Dish",
];


//Pulled from AdminCreateProduct.jsx
const AdminUpdateProduct = ({
  productId,
  isArchived = false,
  onClose,
  onProductChanged,
}) => {
  
  const id = productId; // Get the product ID from the page that opened popup

  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");
  const [weight, setWeight] = useState("");
  const [category, setCategory] = useState([]);// change to array, maybe change how we are storing in the db?
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [newImageOrders, setNewImageOrders] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingField, setEditingField] = useState(null) //Will determine which is editable
  const toggleCategory = (selectedCategory) => { // checks whether or not the category has already been selected 
    if (category.includes(selectedCategory)) { //means the category has already been selected
      setCategory(
        category.filter((category) => category !== selectedCategory) // Removes the selected category
      );
    } else {
      setCategory([...category, selectedCategory]); // sets the selected categories
    }
    };

  useEffect(() => {
    const fetchProduct = async () => {
      setError("");

      const {data, error: fetchError} = await supabase
        .from("products")
        .select("name, price, description, stock, weight, category, Availability, product_images(id, image_url, display_order)")
        .eq("id", id) //Based on matching id
        .single(); //Retun one instead of the whole array
      
      //Error handling
      if (fetchError) {
        console.error("Error fetching product:", fetchError);
        setError("unable to load this product.");
        return;
      }

      //Fill form fields with data from DB
      setProductName(data.name || "");
      setPrice(
        data.price !== null && data.price !== undefined
          ? Number(data.price).toFixed(2)
          : ""
      );
      setDescription(data.description || "");
      setStock(data.stock ?? "");
      setWeight(data.weight ?? "");
      setCategory(data.category ? data.category.split(",").map((item) => item.trim()): []);
      setIsActive(data.Availability)
      //Arrange from Main to last
      setExistingImages(
        [...(data.product_images || [])].sort( //Copy array > ...
          (firstImage, secondImage) =>
            firstImage.display_order - secondImage.display_order //Numeric comparison
        )
        .map((image, index) => ({
          ...image,
          display_order: index + 1,
        }))
      );
    
    };

    fetchProduct();

  }, [id]);



  // Actual updateProduct function


  const updateProduct = async () => { //Creates a function called updateProduct. Asynch allows it to wait for the db request
    // Prevent another action while a request is processing
    if (isSaving || loading) {
      return;
    }

    setIsSaving(true);

    try {
      // Clear messages from the previous save attempt
      setError("");
      setSuccess("");
   

      // Reject empty names and names containing only spaces
      if (!productName.trim()) {
        setError("Product name is required");
        return;
      }


            // Reject blank, non-numeric, infinite, or negative prices
      const numericPrice = Number(price);

      if (
        price.trim() === "" ||
        !Number.isFinite(numericPrice) ||
        numericPrice < 0
      ) {
        setError("Please enter a valid price of 0 or greater");
        return;
      }

      // Reject blank, negative, fractional, or unsafe inventory values
      const numericStock = Number(stock);

      if (
        String(stock).trim() === "" ||
        !Number.isSafeInteger(numericStock) ||
        numericStock < 0
      ) {
        setError("Please enter a whole number of 0 or greater for inventory");
        return;
      }

      // Reject blank, non-numeric, infinite, zero, or negative weights
      const numericWeight = Number(weight);

      if (
        String(weight).trim() === "" ||
        !Number.isFinite(numericWeight) ||
        numericWeight <= 0
      ) {
        setError("Please enter a valid weight greater than 0");
        return;
      }


    const updatedProduct = { //Creates object only when function runs. Updated product stores values to be sent to DB
      name: productName.trim(),
      price: numericPrice.toFixed(2),
      description: description.trim(),
      stock: numericStock,
      weight: numericWeight,
      category: category.join(","),
    };

    //Supabase update query
    const {error: updateError} = await supabase
      .from("products") //Products table in DB
      .update(updatedProduct) //Replace fields with updated ones in object
      .eq("id", id); //Row matching ID

    if (updateError) {
      console.error("Error updating product:", updateError);
      setError("Unable to save changes.");
      return;
    }

    //Save image display order in DB through Promise.all
    const imageOrderResults = await Promise.all( 
      existingImages.map((image) =>
      supabase
        .from("product_images")
        .update({
          display_order: image.display_order,
        })
        .eq("id", image.id)
      
      )
    );

    //Check if iamge order update failed
    const failedOrderUpdate = imageOrderResults.find(
      (result) => result.error
    );

    if (failedOrderUpdate) {
      console.error(
        "Error updating image order:",
        failedOrderUpdate.error
      );

      // Product details saved, but some image-position updates failed
      setError(
        "Product details were saved, but not all existing image positions could be saved."
      );

      return;
    }



    //Send image request if user selected > 0 image
    if (newImages.length >0) {
      const imageFormData = new FormData(); //FormData object to hold the image files

      newImages.forEach((image) => {
        imageFormData.append("images", image); //Loop through new images and add to formData
      });


      //Send each new image's selected display pos
      imageFormData.append(
        "displayOrders",
        JSON.stringify(newImageOrders) //Convert array to JSON string
      );
      //Send to backend
      const imageResponse = await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/products/${id}/images`,
      {
          method: "POST",
          body: imageFormData, //Send body with all selected image files
        }
      );

      const imageResult = await imageResponse.json(); //Convert backend response to Javascript object

       if (!imageResponse.ok) {
        console.error("Error adding product images:", imageResult);

        // Earlier save steps succeeded before the image upload failed
        setError(
          "Product details and existing image positions were saved, but the new images could not be added."
        );

        return;
      }

      //Add the newly saved image records to the displayed image list
      setExistingImages((currentImages) => [
        ...currentImages,
        ...imageResult.images,
      ]);

      //Clear the newly selected files and their temp pos
      setNewImages([]);
      setNewImageOrders([]);


      console.log("Image endpoint response:", imageResult);
    
    }


    setSuccess("Product updated successfully.");

    //Tell page to retrieve updated product info
    onProductChanged(); 

    setTimeout(() => {
      setSuccess("");
    }, 3000);


      console.log("Product ID:", id);
      console.log("Updated values:", updatedProduct);
    } catch (error) {
      console.error("Error saving product:", error);

      // An interrupted request may have completed some save steps
      setError(
        "Saving was interrupted. Some changes may already have been saved. Check the product before retrying."
      );
    } finally {
      // Restore the buttons after success or failure
      setIsSaving(false);
    }
  };
  



  //Begin deleting one existing product image
  const deleteExistingImage = async (imageToDelete) => {
    //Ask for confirmation
    const confirmed = window.confirm( "Are you sure you want to delete this image?");

    //Stop if user clicks cancel
    if (!confirmed) {
      return;
    }

    //Ask the backend to delete the image
    const deleteResponse = await fetch(
    `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/products/${id}/images/${imageToDelete.id}`,
    {
        method: "DELETE",
      }
    );


  //Convert the backend response into a Javascript object
  const deleteResult = await deleteResponse.json();

  //Stop and give error if backend could not delete image
  if (!deleteResponse.ok) {
    console.error("Error deleting product image:", deleteResult);

    setError(
      deleteResult.message || "Unable to delete this image."
  
    );

    return;

  }


  // Combine remaining saved images and newly selected images
  const remainingImages = [
    ...existingImages
      .filter((image) => image.id !== imageToDelete.id)
      .map((image) => ({
        type: "existing",
        image,
        display_order: image.display_order,
      })),

    ...newImages.map((_, index) => ({
      type: "new",
      newImageIndex: index,
      display_order:
        newImageOrders[index] ??
        existingImages.length + index + 1,
    })),
  ]
    .sort(
      (firstImage, secondImage) =>
        firstImage.display_order - secondImage.display_order
    )
    .map((image, index) => ({
      ...image,
      display_order: index + 1,
    }));

  // Update saved images using their positions in the combined list
  const reorderedRemainingImages = remainingImages
    .filter((image) => image.type === "existing")
    .map((image) => ({
      ...image.image,
      display_order: image.display_order,
    }));

  setExistingImages(reorderedRemainingImages);

  // Update positions in the same order as the newImages file array
  setNewImageOrders(
    remainingImages
      .filter((image) => image.type === "new")
      .sort(
        (firstImage, secondImage) =>
          firstImage.newImageIndex - secondImage.newImageIndex
      )
      .map((image) => image.display_order)
  );

    //Save each remaining image's new position to Supabase
    const orderUpdateResults = await Promise.all(
      reorderedRemainingImages.map((image) =>
      supabase
        .from("product_images")
        .update({
          display_order: image.display_order,
        })
        .eq("id", image.id)
    )
  );

  //Find the first failed image order update
  const failedOrderUpdate = orderUpdateResults.find(
    (result) => result.error
  );

  if (failedOrderUpdate) {
    console.error(
      "Could not renumber images after deletion:",
      failedOrderUpdate.error
    );

    setError(
      "The image was deleted, but the remaining image order could not be saved"
    );

    return;
  }


};


//Used when prodict Availability is true
const deleteProduct = async () => {
  const confirmed = window.confirm(
    "Are you sure you want to delete this product?"
  );

  if (!confirmed) {
    return;
  }

  setLoading(true);
  setError("");
  setSuccess("");

  try {
    const { error: deleteError } = await supabase
      .from("products")
      .update({
        Availability: false,
      })
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting product:", deleteError);
      setError("Unable to delete product.");
      return;
    }

    // Soft delete succeeded
    setSuccess("Product deleted successfully.");

    //Tells page to retrieve its updated product list
    onProductChanged();

    onClose();



  } catch (error) {
    console.error("Error deleting product:", error);
    setError("Unable to delete product.");

  } finally {
    setLoading(false);
  }
};

//Used when product is_active is false to restore/re-add it to the shop
const handleRestoreProduct = async () => {
  const confirmed = window.confirm(
    "Are you sure you want to re-add this product to the shop?"
  );

  if (!confirmed) return;

  setLoading(true);
  setError("");
  setSuccess("");

  try {
    const { error: restoreError } = await supabase
      .from("products")
      .update({ Availability: true })
      .eq("id", id);

    if (restoreError) {
      console.error("Error restoring product:", restoreError);
      setError("Unable to re-add product.");
      return;
    }

    setIsActive(true);
    setSuccess("Product re-added successfully.");

    // Refresh products on parent page
    await onProductChanged?.();

    // Close popup
    onClose();
  } catch (err) {
    console.error("Unexpected error restoring product:", err);
    setError("Unable to re-add product.");
  } finally {
    setLoading(false);
  }
};





      //Admin Update Product container
      return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60">
            <div className="min-h-full flex justify-center pt-16 pb-8 md:pt-12 md:pb-12">
              <div className="w-full max-w-lg h-fit rounded-lg bg-[#C5AE98] p-8">          
                
                <button
                  type="button"
                  onClick={onClose}
                  className="float-right text-2xl text-white cursor-pointer"
                >
                  ×
                </button>

        <h2 className="text-4xl md:text-4xl text-center font-serif text-white">
          {productName}
        </h2>




        {/* Update a Product container*/}
        <div className="w-full max-w-md mx-auto p-6 pb-12 rounded-2xl md:border md:border-white/30 md:shadow-lg bg-[#C5AE98]/20 backdrop-blur-lg md:mt-8 md:mb-8">            
          <div className="space-y-4">

            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Product Name</label>
                
                <div className="relative">

                  {/*Read only unless pencil has been clicked. Lock when clicking outside the box*/}
                  <textarea
                  placeholder="Value"
                  className="w-full bg-white rounded-lg px-3 py-2 pr-10 font-sans text-gray-800 placeholder-gray-400 outline-none outline-none resize-none overflow-hidden [field-sizing:content]"
                  value = {productName} onChange = {(e) => setProductName(e.target.value)}
                  readOnly = {editingField !== "name"} 
                  onBlur={() => setEditingField(null)}
                  />

                  <button
                    type="button"
                    onClick={() => setEditingField("name")}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer ${
                      editingField === "name"
                      ? "text-gray-800"
                      : "text-gray-500"
                    }`}
                    aria-label="edit product name"
                  >
                    <FiEdit2/> {/*Icon for editing*/}
                  </button>

                </div>

            </div>



            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Price</label>
                
                 <div className="relative">
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {price} onChange = {(e) => setPrice(e.target.value)}
                readOnly = {editingField !== "price"}
                onBlur={() => setEditingField(null)} 
                  />

                  <button
                    type="button"
                    onClick={() => setEditingField("price")}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer ${
                      editingField === "price"
                      ? "text-gray-800"
                      : "text-gray-500"
                    }`}
                    aria-label="edit price"
                  >
                    <FiEdit2/> {/*Icon for editing*/}
                  </button>

                </div>
            </div>



            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Description</label>
                
                <div className="relative">
                <textarea
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none outline-none resize-none overflow-hidden [field-sizing:content]"
                value = {description} onChange = {(e) => setDescription(e.target.value)}
                readOnly = {editingField !== "description"} 
                onBlur={() => setEditingField(null)}
                  />

                  <button
                    type="button"
                    onClick={() => setEditingField("description")}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer ${
                      editingField === "description"
                      ? "text-gray-800"
                      : "text-gray-500"
                    }`}
                    aria-label="edit description"
                  >
                    <FiEdit2/> {/*Icon for editing*/}
                  </button>

                </div>
            </div>


            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Inventory</label>
                
                <div className="relative">
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {stock} onChange = {(e) => setStock(e.target.value)}
                readOnly = {editingField !== "stock"} 
                onBlur={() => setEditingField(null)}
                  />

                  <button
                    type="button"
                    onClick={() => setEditingField("stock")}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer ${
                      editingField === "stock"
                      ? "text-gray-800"
                      : "text-gray-500"
                    }`}
                    aria-label="edit stock"
                  >
                    <FiEdit2/> {/*Icon for editing*/}
                  </button>

                </div>
            </div>



             <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Weight</label>
                
                <div className="relative">
                <input
                placeholder="Value"
                className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-800 placeholder-gray-400 outline-none"
                value = {weight} onChange = {(e) => setWeight(e.target.value)}
                readOnly = {editingField !== "weight"}
                onBlur={() => setEditingField(null)} 
                  />

                  <button
                    type="button"
                    onClick={() => setEditingField("weight")}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer ${
                      editingField === "weight"
                      ? "text-gray-800"
                      : "text-gray-500"
                    }`}
                    aria-label="edit weight"
                  >
                    <FiEdit2/> {/*Icon for editing*/}
                  </button>

                </div>
            </div>



            <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">Category tag</label>
            <details className="relative">
            <summary className="w-full bg-white rounded-lg px-3 py-2 font-sans text-gray-700 cursor-pointer list-none">
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


             {/*Give component newly selected and existing images to update selection*/}
             <div>
                <label className="block text-lg md:text-xl font-serif text-white mb-2">
                  Images
                </label>

                <AdminImageManager
                  newImages={newImages}
                  setNewImages={setNewImages}
                  newImageOrders={newImageOrders}
                  setNewImageOrders={setNewImageOrders}
                  existingImages={existingImages}
                  setExistingImages={setExistingImages}
                  onDeleteExisting={deleteExistingImage}
                />
            </div>



          {/*Display success or error messages*/}
            {error && (
               <p className="text-red-600 text-md md:text-xl text-center">{error}</p>
            )}

            {success && (
               <p className="text-green-600 text-md md:text-xl text-center">{success}</p>
            )}


            {/*Run updateProduct function on click*/}
            <button
              type="button"
              onClick={updateProduct}
              disabled={loading || isSaving}
              aria-busy={isSaving}
              className={`mt-8 w-full py-2 md:h-10 rounded-lg bg-[#8B6B4A] border border-white/30 shadow-sm text-white text-md md:text-xl flex items-center justify-center transition ${
                loading || isSaving
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:scale-105"
              }`}
            >
              {isSaving ? "Saving Changes..." : "Save Changes"}
            </button>

            {/*Delete product and readd functionality goes here*/}
            {/*When is_active is true, it is delete product, when false it is readd product*/}
            <button
              type="button"
              onClick={isActive ? deleteProduct : handleRestoreProduct}
              disabled={loading || isSaving}
              className={`mt-8 w-full py-2 md:h-10 rounded-lg bg-white/15 border border-white/30 shadow-sm text-white text-md md:text-xl flex items-center justify-center transition ${
                loading || isSaving
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:scale-105"
              }`}
            >
              {loading
                ? (isActive ? "Deleting Product..." : "Re-adding Product...")
                : (isActive ? "Delete Product" : "Re-add Product")
              }
        
            </button>



               </div>
          </div>
        </div>
      </div>
    </div>
  );
    
  
};

export default AdminUpdateProduct;
