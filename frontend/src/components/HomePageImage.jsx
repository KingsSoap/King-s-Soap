import supabase from "../supabaseClient";
//pull image from supabase, PUBLIC, change ot PRIVATE when production
const getImageUrl =  (imagePath) => {
    const { data } = supabase.storage
      .from("Product Images")
      .getPublicUrl(imagePath);
      return data.publicUrl;
  };

function HomeImage() {
        const HomePageImage = getImageUrl("images/home-page-image.jpg");
    return (
        <div className = "relative flex justify-between items-center home-image">
            
        {/*Home Page Image*/}
        <img src={HomePageImage} alt="HomePageImage" className="home-page-image mx-auto w-full" />

        {/*Darken the image behind the text on mobile*/}
        <div className="absolute inset-0 bg-black/20 lg:bg-transparent" aria-hidden="true" />

        {/*Text Over the Image*/}
        <div className="absolute inset-0 flex flex-col items-center pt-23 md:pt-40 text-white text-center">
            <h1 className="text-2xl md:text-5xl font-serif">
            King’s Soap
            </h1>

            <p className="md:mt-4 text-sm md:text-xl font-serif font-medium leading-relaxed">
            Enjoying the art of soap-making since 2016.
            </p>
            <p className="text-sm md:text-xl font-serif">Handmade | Family-Owned</p>
        </div>
        {/*
        <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white text-4xl font-bold p-4  bg-opacity-50">
                Kings Soap
            </p>
            <p className="text-white text-4xl  p-4  bg-opacity-50">
                Kings Soap
            </p>
            
        </div>
        */}
        </div>
    
    );
}

export default HomeImage;