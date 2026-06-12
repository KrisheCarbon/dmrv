export function validateMobileNumber(mobile) {
  const cleaned = String(mobile || "").replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(cleaned);
}

export function validateFarmerForm(form) {
  const errors = [];

  if (!form.farmer_name?.trim()) {
    errors.push("Farmer name is required.");
  }

  if (!validateMobileNumber(form.mobile_number)) {
    errors.push("Enter a valid 10-digit mobile number.");
  }

  if (!form.latitude || !form.longitude) {
    errors.push("Farm location (GPS) is required.");
  }

  if (!form.address?.trim()) {
    errors.push("Address could not be resolved. Refresh location.");
  }

  const landSize = Number(form.total_land_size);
  if (!form.total_land_size || isNaN(landSize) || landSize <= 0) {
    errors.push("Total land size (acres) is required.");
  }

  if (!Array.isArray(form.crops) || form.crops.length === 0) {
    errors.push("Add at least one crop.");
  } else {
    form.crops.forEach((crop, i) => {
      const label = `Crop ${i + 1}`;
      if (!crop.crop_name?.trim()) {
        errors.push(`${label}: crop name is required.`);
      }
      const area = Number(crop.crop_area);
      if (!crop.crop_area || isNaN(area) || area <= 0) {
        errors.push(`${label}: crop area is required.`);
      }
      if (!crop.sowing_date) {
        errors.push(`${label}: estimated sowing date is required.`);
      }
      if (!crop.harvest_date) {
        errors.push(`${label}: estimated harvest date is required.`);
      }
      if (
        crop.sowing_date &&
        crop.harvest_date &&
        new Date(crop.harvest_date) <= new Date(crop.sowing_date)
      ) {
        errors.push(`${label}: harvest date must be after sowing date.`);
      }
    });
  }

  if (form.prior_biochar_exp) {
    const priorArea = Number(form.prior_biochar_acreage);
    if (
      !form.prior_biochar_acreage ||
      isNaN(priorArea) ||
      priorArea <= 0
    ) {
      errors.push("Prior biochar creation area is required when experience is Yes.");
    }
  }

  return errors;
}
