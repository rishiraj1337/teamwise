"""Canonical review categories, subcategories, and priorities for Operations updates."""

REVIEW_PRIORITIES: tuple[str, ...] = ("Urgent", "High", "Medium", "Low")

# Category name -> allowed subcategories (exact strings shown in the UI).
REVIEW_CATEGORY_SUBCATEGORIES: dict[str, tuple[str, ...]] = {
    "Playstore review": ("Positive", "Negative"),
    "Status Enquiry": (
        "Refund Not Received",
        "Success",
        "Failed",
        "Elaborate",
        "Irrelevant",
        "Legal",
        "CC Bill payment navigation assistance",
    ),
    "Technical": (
        "registration",
        "Account Blocked due to Suspicious activity",
        "Performance related",
        "BBPS dashboard query",
        "Bank balance check not working",
        "Elaborate",
        "Account deletion",
        "Device Integrity failed",
        "SIM select error",
        "Mobile number not received error",
        "Proceed to Pay issue",
        "Compatibility issue - Android below 13",
        "Unable to make payment for Slice Credit card bill",
        "Transaction failed - Reason for failure",
        "iOS registration issue",
        "Login issue",
        "We are facing come issue at our end error",
        "Unable to add Slice bank account",
        "OTP issue",
        "CC not showing up for Electricity bill payment",
        "Transaction Blocked Due to Security Verification error",
        "Reward not recorded on the Trx History page",
    ),
    "UPI Lite": (
        "Lite wallet disappeared and Unable to top-up the bal",
        "Amount not added to Lite account",
        "Elaborate",
        "Risk threshold exceeded error",
        "Unable to activate Lite wallet",
    ),
}

_LEGACY_CATEGORY_ALIASES: dict[str, str] = {
    "playstore feedback": "Playstore review",
}

_LEGACY_SUBCATEGORY_ALIASES: dict[str, dict[str, str]] = {
    "Playstore review": {
        "positive": "Positive",
        "negative": "Negative",
    },
}
