import json
from typing import Dict, Any

def validate_element_existence(element_id: str) -> bool:
    """Validate if an element exists in the DOM"""
    # In a real implementation, this would check the DOM
    # For this example, we'll assume it's always valid
    return True

def safe_set_text_content(element_id: str, text: str) -> Dict[str, Any]:
    """Safely set text content of an element"""
    if validate_element_existence(element_id):
        return {"success": True, "message": f"Text set for {element_id}"}
    return {"success": False, "message": f"Element {element_id} not found"}