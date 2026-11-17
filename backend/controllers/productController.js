import supabase from "../supabaseClient.js";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";

// Allowed image formats and their extensions
const allowedImageTypes = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};

// Verify the actual file type using its contents
const validateImage = async (file) => {
    const detectedType = await fileTypeFromBuffer(file.buffer);

    // Reject files that are not supported images
    if (!detectedType || !allowedImageTypes[detectedType.mime]) {
        return null;
    }

    // Reject files whose declared MIME type doesn't match
    if (file.mimetype !== detectedType.mime) {
        return null;
    }

    return allowedImageTypes[detectedType.mime];
};

export const getAllProducts = async (req, res) => {};


export const createProduct = async (req, res) => {
    try {


        // Trim text fields and treat missing or non-text values as empty
        const readTextField = (value) =>
            typeof value === "string" ? value.trim() : "";

        // Read the submitted fields without surrounding spaces
        const productName = readTextField(req.body?.productName);
        const priceInput = readTextField(req.body?.price);
        const stockInput = readTextField(req.body?.stock);
        const weightInput = readTextField(req.body?.weight);

        // Convert numeric fields for validation and database storage
        const numericPrice = Number(priceInput);
        const numericStock = Number(stockInput);
        const numericWeight = Number(weightInput);

        // Reject missing names and names containing only spaces
        if (!productName) {
            return res.status(400).json({
                message: "Product name is required",
            });
        }

        // Price must be finite and non-negative; zero is allowed
        // Check for empty input because Number("") becomes 0
        if (
            priceInput === "" ||
            !Number.isFinite(numericPrice) ||
            numericPrice < 0
        ) {
            return res.status(400).json({
                message: "Please enter a valid price of 0 or greater",
            });
        }

        // Inventory must be a whole number JavaScript can represent safely
        // Zero is allowed; negatives, fractions, and empty input are rejected
        if (
            stockInput === "" ||
            !Number.isSafeInteger(numericStock) ||
            numericStock < 0
        ) {
            return res.status(400).json({
                message: "Please enter a whole number of 0 or greater for inventory",
            });
        }

        // Weight must be finite and greater than zero; decimals are allowed
        if (
            weightInput === "" ||
            !Number.isFinite(numericWeight) ||
            numericWeight <= 0
        ) {
            return res.status(400).json({
                message: "Please enter a valid weight greater than 0",
            });
        }

        // Validation passed; continue with the existing image-file check


        if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "At least one image file is required" });
        }


        //Store the public DB URL created for each image
        const publicUrls = [];

        //Store each Storage path in case the upload needs to be reversed
        const uploadedFilePaths = [];

        // Validate all images before uploading anything to Supabase
        const validatedImages = [];

        for (const file of req.files) {
            const extension = await validateImage(file);

            if (!extension) {
                return res.status(400).json({
                    message: "Invalid image. Only valid JPG, PNG, and WebP files are allowed.",
                });
            }

            validatedImages.push({ file, extension });
        }

        // Upload each validated image to Supabase
        for (const { file, extension } of validatedImages) {
            const filePath = `images/${randomUUID()}${extension}`;

            //Ask DB to upload current image file
            const {error:uploadError} = await supabase.storage
                .from("Product Images")
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype,
                });

            if (uploadError) {
                console.error("Could not upload image:", uploadError);

                //Remove files that uploaded successfully during this request
                if (uploadedFilePaths.length > 0) {
                    const { error: cleanupError } = await supabase.storage
                        .from("Product Images")
                        .remove(uploadedFilePaths);

                    if (cleanupError) {
                        console.error(
                            "Could not clean up previously uploaded files:",
                            cleanupError
                        );
                    }
                }

                return res.status(500).json({ message: "Failed to upload image to storage" });
        
            }

            //Remember successfully uploaded file path
            uploadedFilePaths.push(filePath);

            // Get public URL for the uploaded image
            const { data: urlData } = supabase.storage.from("Product Images").getPublicUrl(filePath);
        
            publicUrls.push(urlData.publicUrl); 

        }



        // Insert product details into product table
        const { data: productData, error: productError } = await supabase.from("products").insert([{
            name: productName,       // Validated name with surrounding spaces removed
            price: numericPrice,     // Validated price: zero or greater
            description: req.body.description,
            stock: numericStock,     // Validated inventory: non-negative whole number
            weight: numericWeight,   // Validated weight: greater than zero
            category: req.body.category,
        },
    ])
    .select();

    if (productError) {
        console.error("Could not insert product into database:", productError);
        
         //Product failed, so remove all files uploaded for it
                
        const { error: cleanupError } = await supabase.storage
            .from("Product Images")
            .remove(uploadedFilePaths);

        if (cleanupError) {
            console.error(
                "Could not clean up uploaded files:",
                cleanupError
            );
                    
        }
        
        return res.status(500).json({ message: "Failed to insert product into database" });
    }

    console.log("Product inserted into database:", productData);

    // Get id of the newly created product
    const newProduct = productData[0];



    //Create database row for every uploaded image
    const imageRows = publicUrls.map((publicUrl, index) => ({
        product_id: newProduct.id,
        image_url: publicUrl.trim(),
        display_order: index + 1,
    }));

    // Use id to insert image URL into the product image table
    const { data: imageData, error: imageError } = await supabase
        .from("product_images")
        .insert(imageRows);
           


        if (imageError) {
        console.error("Could not add image row to database:", imageError);
        
        
        //Remove product row that was created
        const {error: productCleanupError } = await supabase
            .from("products")
            .delete()
            .eq("id", newProduct.id);
        
        if (productCleanupError) {
            console.error(
                "Could not clean up the product row:",
                productCleanupError
            );
        }


        //Remove uploaded image files from Storage
        const { error: fileCleanupError } = await supabase.storage
            .from("Product Images")
            .remove(uploadedFilePaths);

        if (fileCleanupError) {
            console.error(
                "Could not clean up uploaded files:",
                fileCleanupError
            );
                    
        }    
        
        
        return res.status(500).json({ message: "Failed to add image row to database" });
        }

        console.log("Image row added to database:", imageData);

    // Return success response with product id and image URL
    return res.status(201).json({ message: "Product created successfully", product_id: newProduct.id, imageUrls: publicUrls, },);
    }
    catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({ message: "Internal server error" });
    }
    

};







//Add new images to an existing product
export const addProductImages = async (req, res) => {
    const { id } = req. params;

    console.log("Existing product ID:", id);
    console.log("New image files:", req.files);


//Stop if the request does not contain any image files
if (!req.files || req.files.length === 0) {
    return res.status(400).json({
        message: "At least one image upload is required",
    });
}


//Convert the display order JSON string back into an array
let displayOrders = []

try {
    displayOrders = JSON.parse(
        req.body.displayOrders || "[]"
    );
} catch (error) {
    return res.status(400).json({
        message: "Invalid image display order",
    });
}

 //Find last image position currently used by product
const {data: lastImageRows, error: orderError } = await supabase
    .from("product_images")
    .select("display_order")
    .eq("product_id", id)
    .order("display_order", {ascending: false})
    .limit(1); //Only return one db row

if (orderError) {
    console.error("Could not find the current image order:", orderError);

    return res.status(500).json({
                message: "Failed to determine the next image position",
    });
}


 //Use zero as default when no existing images
        const highestExistingOrder = 
            lastImageRows[0]?.display_order ?? 0;

//Store the public URLs created for the newly uploaded images
const publicUrls =[];

//Store internal paths in case the upload has to be reversed
const uploadedFilePaths = [];

// Validate all images before uploading anything to Supabase
const validatedImages = [];

for (const file of req.files) {
    const extension = await validateImage(file);

    if (!extension) {
        return res.status(400).json({
            message: "Invalid image. Only valid JPG, PNG, and WebP files are allowed.",
        });
    }

    validatedImages.push({ file, extension });
}

// Upload each validated image to Supabase
for (const { file, extension } of validatedImages) {
    const filePath = `images/${randomUUID()}${extension}`;

    //Ask DB to upload current image file
    const {error:uploadError} = await supabase.storage
        .from("Product Images")
        .upload(filePath, file.buffer, {
            contentType: file.mimetype,
        });

            if (uploadError) {
                console.error("Could not upload image:", uploadError);


                //Remove files that uploaded successfully during this request
                if (uploadedFilePaths.length > 0) {
                    const { error: cleanupError } = await supabase.storage
                        .from("Product Images")
                        .remove(uploadedFilePaths);

                    if (cleanupError) {
                        console.error(
                            "Could not clean up previously uploaded files:",
                            cleanupError
                        );
                    }
                }
        
                return res.status(500).json({ message: "Failed to upload image to storage" });
        
            }

            //Remember the successfully uploaded file's internal path
            uploadedFilePaths.push(filePath);

            // Get public URL for the uploaded image
            const { data: urlData } = supabase.storage.from("Product Images").getPublicUrl(filePath);
        
            publicUrls.push(urlData.publicUrl); 

 }


//Create one product_images row for every uploaded image URL
const imageRows = publicUrls.map((publicUrl, index) => ({
    product_id: id,
    image_url: publicUrl.trim(),
    display_order: 
        displayOrders[index] ??
        highestExistingOrder + index + 1,
}));

//Connect the uploaded images to the existing product
const {data: imageData, error: imageError} = await supabase
    .from("product_images")
    .insert(imageRows)
    .select();



//Stop if the image rows couldn't be added
if (imageError) {
    console.error("Could not add image rows:", imageError);

    //If database insert failed, remove the uploaded files
    const { error: cleanupError } = await supabase.storage
        .from("Product Images")
        .remove(uploadedFilePaths);

    if (cleanupError) {
        console.error(
            "Could not clean up uploaded files:",
            cleanupError
        );
    }

    return res.status(500).json({
        message: "Failed to connect images to product",
    
    });
}

//Send the completed image records back to the frontend
return res.status(201).json({
    message: "Product images added successfully",
    images: imageData,
});

};









//Delete one existing image from a product
export const deleteProductImage = async (req, res) => {
    const { id, imageId } = req.params; //Id is the product and imageId is the id for the image

    //Find the selected image and confirm it belongs to the product
    const { data: imageData, error: findImageError } = await  supabase
        .from("product_images")
        .select("id, image_url")
        .eq("id", imageId)
        .eq("product_id", id)
        .single();


    //Stop if selected image could not be found
    if (findImageError) {
        console.error("Could not find product image:", findImageError);

        return res.status(404).json({
            message: "Product image not found",

        });
    }


    //Convert the public image URL into its supabase storage file path
    const decodedUrlPath = decodeURIComponent(
        new URL(imageData.image_url).pathname
    );

    const bucketPath = "/storage/v1/object/public/Product Images/";

    const filePath = decodedUrlPath.split(bucketPath)[1]; //Keeps shorter image path to delete file


    //Stop if the storage path could not be extracted from the public URL
    if (!filePath) {
        console.error("Could not determine image storage path"); //Error for backend terminal

        return res.status(500).json({
            message: "Could not determine image storage path", //For frontend browser
        });
    }


    //Delete the image file from supabase storage
    const { error: storageDeleteError } = await supabase.storage
        .from("Product Images")
        .remove([filePath]);



    //Stop if supabase storage could not delete the image file
    if (storageDeleteError) {
        console.error(
            "Could not delete image from storage:",
            storageDeletError
        );

        return res.status(500).json({
            message: "Unable to delete this image from storage",
        });
    }


    //Delete the image record from the product_images table
    const {error: deleteRowError } = await supabase
        .from("product_images")
        .delete()
        .eq("id", imageId)
        .eq("product_id", id);


    //Stop if the product_images db row could not be deleted
    if (deleteRowError) {
        console.error(
            "Could not delete image row:", deleteRowError);

        return res.status(500).json({
            message: "The image file was removed but it's db record could net be deleted",
        });
    }


    //Tell the frontend that the image was deleted successfully
    return res.status(200).json({
        message: "Product image deleted successfully",
        imageId: imageId,
    });
};







//Delete a product
export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    console.log("Deleting product:", productId);

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) {
      console.error("Delete error:", error);

      return res.status(500).json({
        message: "Failed to delete product",
      });
    }

    return res.status(200).json({
      message: "Product deleted successfully",
    });

  } catch (error) {
    console.error("Error deleting product:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

