from pydantic import BaseModel
from typing import List

class Recommendation(BaseModel):
    type: str  # "bill", "save", "warning"
    text: str

class AllocationResponse(BaseModel):
    liquid_cash: float
    unpaid_obligations_this_month: float
    freedom_cash: float
    message: str
    recommendations: List[Recommendation]
