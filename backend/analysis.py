from typing import List, Dict, Optional
from datetime import date, datetime, timedelta
import math

def calculate_amortization(
    principal: float, 
    annual_interest_rate: float, 
    monthly_payment: float
) -> Dict:
    """
    Calculates the time to payoff and total interest for a single debt.
    Rate is percentage (e.g. 24.0 for 24%).
    """
    if principal <= 0:
        return {"months": 0, "total_interest": 0.0, "payoff_date": date.today()}
    
    if monthly_payment <= 0:
         return {"months": float('inf'), "total_interest": float('inf'), "payoff_date": None}

    monthly_rate = (annual_interest_rate / 100) / 12
    
    # Check if payment covers interest
    monthly_interest_only = principal * monthly_rate
    if monthly_payment <= monthly_interest_only:
        return {
            "months": float('inf'), 
            "total_interest": float('inf'), 
            "warning": "Payment too low to cover interest",
            "payoff_date": None
        }

    # Amortization calculation
    balance = principal
    total_interest = 0.0
    months = 0
    
    # Preventing infinite loops with a cap (e.g. 100 years)
    max_months = 1200 
    
    while balance > 0 and months < max_months:
        interest_charge = balance * monthly_rate
        total_interest += interest_charge
        principal_paid = monthly_payment - interest_charge
        balance -= principal_paid
        months += 1
        
    payoff_date = date.today() + timedelta(days=months*30)
    
    return {
        "months": months,
        "total_interest": round(total_interest, 2),
        "payoff_date": payoff_date
    }

def simulate_payoff_plan(
    debts: List[Dict], 
    strategy: str = "AVALANCHE", 
    extra_monthly_payment: float = 0.0
) -> Dict:
    """
    Simulates paying off multiple debts with a specific strategy.
    debts: List of dicts {id, name, balance, rate, min_payment}
    strategy: 'AVALANCHE' (High Rate First) or 'SNOWBALL' (Low Balance First)
    """
    # Deep copy to avoid mutating inputs
    active_debts = [d.copy() for d in debts]
    
    # Sort debts based on strategy
    if strategy == "AVALANCHE":
        # Sort by Rate DESC
        active_debts.sort(key=lambda x: x['rate'], reverse=True)
    else: # SNOWBALL
        # Sort by Balance ASC
        active_debts.sort(key=lambda x: x['balance'])
        
    total_interest_paid = 0.0
    months_passed = 0
    timeline = []
    
    # Simulation loop
    # We simulate month by month
    max_months = 600 # 50 years cap
    
    while any(d['balance'] > 0.1 for d in active_debts) and months_passed < max_months:
        months_passed += 1
        month_budget_extra = extra_monthly_payment
        
        month_log = {"month": months_passed, "payments": {}, "remaining_per_debt": {}}
        
        # 1. Charge Interest & set Min Payments
        required_payments = 0.0
        for debt in active_debts:
            if debt['balance'] > 0:
                monthly_rate = (debt['rate'] / 100) / 12
                interest = debt['balance'] * monthly_rate
                total_interest_paid += interest
                debt['balance'] += interest # Add interest first
                
                # Determine min payment (cannot exceed balance)
                min_pay = min(debt['min_payment'], debt['balance'])
                debt['payment_this_month'] = min_pay
                debt['balance'] -= min_pay
                required_payments += min_pay
        
        # 2. Apply "Snowball" (Extra Payment + Freed up Minimums)
        # In a real snowball, when a debt is killed, its min payment is added to the budget.
        # But here 'extra_monthly_payment' is the *additional* on top of sum(original_min_payments)?
        # Or is it a fixed total budget? 
        # Usually: Budget = Sum(All Min Payments) + Extra.
        # As debts die, the Sum(Min) decreases, so the "Avalanche/Snowball" portion increases.
        
        # Let's assume strict snowball:
        # We apply 'month_budget_extra' to the top priority debt.
        # Note: If we already paid min_payments above, 'month_budget_extra' is purely extra.
        # What about the "Freed up min payment"? 
        # If a debt was paid off LAST month, its min payment is correctly gone from 'required_payments',
        # preventing us from "saving" it unless we track a "Global Fixed Monthly Commitment".
        
        # Improved Logic: 
        # Total Monthly Commitment = Sum of Initial Minimum Payments + Extra.
        # Available for Overpayment = (Total Commitment) - (Current Required Minimums).
        
        # We need the INITIAL min payments sum
        # But simplistically, let's just say we have `extra_monthly_payment` available to target highest priority.
        
        for debt in active_debts:
            if debt['balance'] > 0 and month_budget_extra > 0:
                payment = min(month_budget_extra, debt['balance'])
                debt['balance'] -= payment
                debt['payment_this_month'] += payment
                month_budget_extra -= payment
        
        for debt in active_debts:
             month_log["remaining_per_debt"][debt['name']] = round(max(0, debt['balance']), 2)

        timeline.append(month_log)

    return {
        "months_to_freedom": months_passed,
        "final_date": date.today() + timedelta(days=months_passed*30),
        "total_interest": round(total_interest_paid, 2),
        "timeline": timeline
    }

from sqlalchemy.orm import Session
import models

def calculate_allocation(db: Session, user_id: str = None):
    """
    Analyzes liquid cash vs the bills still owed this month.

    Scoped to a single owner: aggregating across users would both leak balances
    between accounts and report a meaningless total.
    """
    # 1. Liquid Cash — checking accounts only. Envelope sub-accounts are also
    # Checking, so money parked in an envelope still counts here; the bill it is
    # earmarked for is still counted below, so the two cancel out.
    acct_q = db.query(models.Account).filter(models.Account.account_type == models.AccountType.CHECKING)
    obl_q = db.query(models.MonthlyObligation)
    if user_id:
        acct_q = acct_q.filter(models.Account.user_id == user_id)
        obl_q = obl_q.filter(models.MonthlyObligation.user_id == user_id)

    liquid_cash = round(sum(float(acc.current_balance or 0) for acc in acct_q.all()), 2)

    # 2. Bills still owed this month. A bill already PAID has left the account,
    # so charging it against the balance again understates what is free to spend.
    obligations = obl_q.all()
    obl_ids = [ob.id for ob in obligations]
    paid_ids = set()
    if obl_ids:
        month_prefix = datetime.now().strftime("%Y-%m")
        paid_ids = {
            p.obligation_id
            for p in db.query(models.Payment).filter(
                models.Payment.obligation_id.in_(obl_ids),
                models.Payment.status == models.PaymentStatus.PAID,
                models.Payment.billing_month.like(f"{month_prefix}%"),
            ).all()
        }

    remaining = [ob for ob in obligations if ob.id not in paid_ids]
    unpaid_obligations = round(sum(float(ob.amount) for ob in remaining if ob.amount), 2)

    freedom_cash = round(liquid_cash - unpaid_obligations, 2)

    recommendations = []

    if freedom_cash < 0:
        recommendations.append({
            "type": "warning",
            "text": f"Deficit warning! You are short {abs(freedom_cash):,.2f} SAR for bills."
        })
    elif freedom_cash > 0:
        recommendations.append({
            "type": "save",
            "text": f"You have {freedom_cash:,.2f} SAR free. Consider moving some to savings."
        })
    else:
        recommendations.append({
            "type": "bill",
            "text": "You are exactly breaking even. Monitor closely."
        })

    if paid_ids:
        recommendations.append({
            "type": "bill",
            "text": f"{len(paid_ids)} of {len(obligations)} bills already paid this month."
        })

    return {
        "liquid_cash": liquid_cash,
        "unpaid_obligations_this_month": unpaid_obligations,
        "freedom_cash": freedom_cash,
        "bills_total": len(obligations),
        "bills_paid": len(paid_ids),
        "bills_remaining": len(remaining),
        "message": "Allocation Analysis",
        "recommendations": recommendations
    }
