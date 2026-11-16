import supabase from "../supabaseClient.js";

export const changeUserAddress = async (req, res) => {
  try {

    const { id } = req.params;

    // Verify that the authenticated user owns this account
    if (req.user.id !== id) {
      return res.status(403).json({
        message: "You are not authorized to update this address."
      });
    }

    const {
      Street,
      "Apt. Num": aptNum,
      City,
      State,
      Country,
      "Zip Code": zipCode
    } = req.body;

    const { data, error } = await supabase
      .from("users")
      .update({
        Street: Street,
        "Apt. Num": aptNum,
        City: City,
        State: State,
        Country: Country,
        "Zip Code": zipCode
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);

      return res.status(500).json({
        message: "Failed to update address"
      });
    }

    return res.status(200).json({
      message: "Address updated successfully",
      user: data
    });

  } catch (error) {

    console.error("Change address error:", error);

    return res.status(500).json({
      message: "Server error"
    });

  }
};