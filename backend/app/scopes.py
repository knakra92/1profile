"""Catalog of shareable profile sections. A consent grant is always for one scope."""

SCOPES: dict[str, dict] = {
    "identity": {
        "label": "Basic identity",
        "description": "Legal name, date of birth, sex, preferred language",
        "group": "Personal",
        "shape": "object",
    },
    "contact": {
        "label": "Contact details",
        "description": "Phone number and email",
        "group": "Personal",
        "shape": "object",
    },
    "addresses": {
        "label": "Addresses",
        "description": "Home, mailing and work addresses",
        "group": "Personal",
        "shape": "list",
    },
    "emergency_contacts": {
        "label": "Emergency contacts",
        "description": "People to contact in an emergency",
        "group": "Personal",
        "shape": "list",
    },
    "insurance": {
        "label": "Insurance",
        "description": "Health insurance plans and member IDs",
        "group": "Health",
        "shape": "list",
    },
    "medical.allergies": {
        "label": "Allergies",
        "description": "Drug, food and environmental allergies",
        "group": "Health",
        "shape": "list",
    },
    "medical.medications": {
        "label": "Medications",
        "description": "Current prescriptions and supplements",
        "group": "Health",
        "shape": "list",
    },
    "medical.conditions": {
        "label": "Conditions",
        "description": "Diagnosed conditions",
        "group": "Health",
        "shape": "list",
    },
    "medical.history": {
        "label": "Medical history",
        "description": "Past surgeries, hospitalizations, family history",
        "group": "Health",
        "shape": "object",
    },
    "medical.immunizations": {
        "label": "Immunizations",
        "description": "Vaccination records",
        "group": "Health",
        "shape": "list",
    },
    "payment": {
        "label": "Payment method",
        "description": "Tokenized card for billing — providers never see the full card number",
        "group": "Financial",
        "shape": "list",
    },
}


def empty_value(scope: str):
    return [] if SCOPES[scope]["shape"] == "list" else {}


def redact_for_provider(scope: str, data):
    """Strip anything a provider should never receive, even with consent."""
    if scope == "payment":
        return [
            {k: card.get(k) for k in ("brand", "last4", "exp_month", "exp_year", "label")}
            | {"charge_via": "1Profile vault"}
            for card in data
        ]
    return data
