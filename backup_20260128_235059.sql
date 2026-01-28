--
-- PostgreSQL database dump
--

\restrict AgJP6pt45ykvmOzK6FXb6PW9wmwIIXkbMxRNFIe5XnSueCrxv0UCouPS03So6Ro

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: accounttype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.accounttype AS ENUM (
    'CHECKING',
    'SAVINGS',
    'CREDIT_CARD',
    'LOAN'
);


ALTER TYPE public.accounttype OWNER TO postgres;

--
-- Name: allocationruletype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.allocationruletype AS ENUM (
    'CATEGORY',
    'LOAN'
);


ALTER TYPE public.allocationruletype OWNER TO postgres;

--
-- Name: messagestatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.messagestatus AS ENUM (
    'PENDING',
    'PARSED',
    'FAILED',
    'IGNORED'
);


ALTER TYPE public.messagestatus OWNER TO postgres;

--
-- Name: paymentstatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.paymentstatus AS ENUM (
    'PAID',
    'PENDING',
    'BUDGET'
);


ALTER TYPE public.paymentstatus OWNER TO postgres;

--
-- Name: transactiontype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.transactiontype AS ENUM (
    'DEBIT',
    'CREDIT'
);


ALTER TYPE public.transactiontype OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_aliases (
    id integer NOT NULL,
    account_id character varying NOT NULL,
    alias_name character varying NOT NULL,
    last_4_digits character varying NOT NULL
);


ALTER TABLE public.account_aliases OWNER TO postgres;

--
-- Name: account_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.account_aliases_id_seq OWNER TO postgres;

--
-- Name: account_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.account_aliases_id_seq OWNED BY public.account_aliases.id;


--
-- Name: account_audits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_audits (
    id character varying NOT NULL,
    account_id character varying NOT NULL,
    audit_date timestamp without time zone,
    system_balance double precision NOT NULL,
    actual_balance double precision NOT NULL,
    difference double precision NOT NULL,
    status character varying NOT NULL,
    notes text
);


ALTER TABLE public.account_audits OWNER TO postgres;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id character varying NOT NULL,
    name character varying NOT NULL,
    account_type public.accounttype NOT NULL,
    first_4_digits character varying,
    bank_name character varying,
    bank_logo_url character varying,
    last_4_digits character varying,
    current_balance double precision,
    notes text,
    credit_limit double precision,
    interest_rate double precision,
    minimum_payment double precision,
    is_income boolean,
    last_successful_audit_date timestamp without time zone
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- Name: allocation_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.allocation_history (
    id character varying NOT NULL,
    month character varying NOT NULL,
    income double precision,
    needs_planned double precision,
    needs_actual double precision,
    wants_planned double precision,
    wants_actual double precision,
    savings_planned double precision,
    savings_actual double precision
);


ALTER TABLE public.allocation_history OWNER TO postgres;

--
-- Name: allocation_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.allocation_rules (
    id character varying NOT NULL,
    rule_type character varying NOT NULL,
    identifier character varying NOT NULL,
    target_account_id character varying NOT NULL
);


ALTER TABLE public.allocation_rules OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id character varying NOT NULL,
    name character varying NOT NULL,
    type character varying DEFAULT 'BOTH'::character varying
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: credit_cards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_cards (
    id character varying NOT NULL,
    name character varying NOT NULL,
    bank_name character varying,
    bank_logo_url character varying,
    last_4_digits character varying,
    current_balance double precision,
    credit_limit double precision,
    statement_day integer,
    due_day integer,
    apr double precision,
    minimum_payment_percent double precision,
    notes text,
    created_at timestamp without time zone
);


ALTER TABLE public.credit_cards OWNER TO postgres;

--
-- Name: currency_wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.currency_wallets (
    id character varying NOT NULL,
    account_id character varying NOT NULL,
    currency_code character varying NOT NULL,
    balance double precision,
    last_updated timestamp without time zone
);


ALTER TABLE public.currency_wallets OWNER TO postgres;

--
-- Name: loans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loans (
    id character varying NOT NULL,
    name character varying NOT NULL,
    principal_amount double precision NOT NULL,
    interest_rate double precision NOT NULL,
    start_date date NOT NULL,
    term_months integer NOT NULL,
    remaining_balance double precision NOT NULL,
    monthly_payment double precision,
    display_order integer DEFAULT 0,
    due_day integer,
    notes text
);


ALTER TABLE public.loans OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    obligation_id character varying NOT NULL,
    payment_date timestamp without time zone,
    amount double precision NOT NULL,
    note character varying,
    billing_month character varying,
    status public.paymentstatus DEFAULT 'PAID'::public.paymentstatus,
    transaction_id character varying,
    planned_amount double precision
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: obligation_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.obligation_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.obligation_history_id_seq OWNER TO postgres;

--
-- Name: obligation_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.obligation_history_id_seq OWNED BY public.payments.id;


--
-- Name: obligations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.obligations (
    id character varying NOT NULL,
    name character varying NOT NULL,
    amount double precision,
    due_day integer NOT NULL,
    category character varying,
    provider character varying,
    notes text,
    display_order integer
);


ALTER TABLE public.obligations OWNER TO postgres;

--
-- Name: raw_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.raw_messages (
    id character varying NOT NULL,
    sender character varying,
    body text NOT NULL,
    "timestamp" timestamp without time zone,
    status public.messagestatus,
    error_log text
);


ALTER TABLE public.raw_messages OWNER TO postgres;

--
-- Name: savings_goals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.savings_goals (
    id character varying NOT NULL,
    name character varying NOT NULL,
    target_amount double precision NOT NULL,
    current_amount double precision,
    target_date date,
    icon character varying,
    color character varying
);


ALTER TABLE public.savings_goals OWNER TO postgres;

--
-- Name: training_examples; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.training_examples (
    id character varying NOT NULL,
    raw_text character varying NOT NULL,
    parsed_json text NOT NULL,
    created_at timestamp without time zone
);


ALTER TABLE public.training_examples OWNER TO postgres;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id character varying NOT NULL,
    account_id character varying,
    amount double precision NOT NULL,
    merchant character varying,
    "timestamp" timestamp without time zone,
    raw_sms_content text,
    category character varying,
    balance_after_transaction double precision,
    logo_url character varying,
    type character varying DEFAULT 'debit'::character varying NOT NULL,
    status character varying DEFAULT 'completed'::character varying NOT NULL,
    notes text,
    fees double precision DEFAULT 0.0,
    original_amount double precision,
    original_currency character varying,
    exchange_rate double precision,
    parsed_data text,
    credit_card_id character varying
);


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: account_aliases id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_aliases ALTER COLUMN id SET DEFAULT nextval('public.account_aliases_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.obligation_history_id_seq'::regclass);


--
-- Data for Name: account_aliases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_aliases (id, account_id, alias_name, last_4_digits) FROM stdin;
1	0cbe5b34-c256-4a86-a025-84916176468f	mada	9365
3	4487ee56-905e-46b4-ade7-07cc761cbada	mada	8438
6	5a8561f7-a712-48b0-baf2-fbbf37a9a49b	mada	6341
9	4af8d356-8af4-4d6f-b959-bd4518504ffd	mada	4390
\.


--
-- Data for Name: account_audits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_audits (id, account_id, audit_date, system_balance, actual_balance, difference, status, notes) FROM stdin;
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts (id, name, account_type, first_4_digits, bank_name, bank_logo_url, last_4_digits, current_balance, notes, credit_limit, interest_rate, minimum_payment, is_income, last_successful_audit_date) FROM stdin;
c430dd59-ecee-4ffb-b499-72ae46ec3097	Wallet	CHECKING	\N	STC Bank	/banks/bank2.png	0863	1000		\N	\N	\N	f	\N
b874ab5b-7562-4bd4-ba54-3344dd8b9aa7	Buckets	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	1964	0		\N	\N	\N	f	\N
310aca4c-fd5b-481b-a8b9-52eae56143b2	House	CHECKING	\N	AlRajhiBank	/banks/bank2.png	2533	0		\N	\N	\N	f	\N
9905717a-fce2-462c-8d6c-9e21d67dcf37	General	CHECKING	\N	AlRajhiBank	/banks/bank2.png	7772	40400		\N	\N	\N	f	\N
4487ee56-905e-46b4-ade7-07cc761cbada	Jazira Checking	CHECKING	\N	Jazira Bank	/banks/ajb.png	8001	300000		\N	\N	\N	f	\N
4848c382-2a39-4cff-8d06-027607bb34c7	Payroll	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	3264	90000		\N	\N	\N	t	\N
f88d6c09-1a09-4679-a98b-09294ef3be40	Auto Lease	CHECKING	\N	AlRajhiBank	/banks/bank2.png	5225	12128.76		\N	\N	\N	f	\N
5a8561f7-a712-48b0-baf2-fbbf37a9a49b	Liability	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	9384	80000		\N	\N	\N	f	\N
4af8d356-8af4-4d6f-b959-bd4518504ffd	Grocery	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	2104	1000		\N	\N	\N	f	\N
0cbe5b34-c256-4a86-a025-84916176468f	Expense	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	1505	97431.13000000002		\N	\N	\N	f	\N
cdc7069f-9e86-46c0-8b53-83722f58e931	Jazira Saving	SAVINGS	\N	Jazira Bank	/banks/ajb.png	8002	250000		\N	\N	\N	f	\N
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alembic_version (version_num) FROM stdin;
\.


--
-- Data for Name: allocation_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.allocation_history (id, month, income, needs_planned, needs_actual, wants_planned, wants_actual, savings_planned, savings_actual) FROM stdin;
\.


--
-- Data for Name: allocation_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.allocation_rules (id, rule_type, identifier, target_account_id) FROM stdin;
ece3a169-7eac-4b8a-8096-5cb8db976ab1	CATEGORY	Credit Card	4487ee56-905e-46b4-ade7-07cc761cbada
c4761acd-3b73-47bb-a22a-44a66f8134a5	CATEGORY	House	5a8561f7-a712-48b0-baf2-fbbf37a9a49b
4c92eeac-4848-409b-9039-8b6b2f3e557c	CATEGORY	Loan	4487ee56-905e-46b4-ade7-07cc761cbada
753eaa4b-445e-485f-b7d6-48a7190eedad	CATEGORY	Auto Loan	f88d6c09-1a09-4679-a98b-09294ef3be40
7df821b1-5684-4a6b-98ca-d0874e617c89	CATEGORY	Other	5a8561f7-a712-48b0-baf2-fbbf37a9a49b
01e18955-f9c0-4e43-8d4b-f163962e44e0	CATEGORY	Personal Expense	0cbe5b34-c256-4a86-a025-84916176468f
697bb2b4-1bfc-4150-b46c-3fd0b25c5b37	CATEGORY	Salary	c430dd59-ecee-4ffb-b499-72ae46ec3097
1433cf87-ee91-428f-949a-45ff1b30c325	CATEGORY	School	5a8561f7-a712-48b0-baf2-fbbf37a9a49b
004f18e9-b04b-4ad1-9d22-4b224e874399	CATEGORY	Subscription	5a8561f7-a712-48b0-baf2-fbbf37a9a49b
2147f872-cbc9-4fe1-b88a-886fd2622502	CATEGORY	Utilities	5a8561f7-a712-48b0-baf2-fbbf37a9a49b
b91f3429-c4fd-402e-a34f-96267673cc0e	LOAN	Personal	4487ee56-905e-46b4-ade7-07cc761cbada
2ff37c1a-9c3a-460e-ac2c-e9cd6c30b3fb	LOAN	Mortgage	4487ee56-905e-46b4-ade7-07cc761cbada
d0c23d8d-114d-4221-bfac-7779b1d0f314	CATEGORY	Transfer	cdc7069f-9e86-46c0-8b53-83722f58e931
5f4a70d3-5c89-4275-b98c-c7df3b9f8eb7	CATEGORY	Bills	5a8561f7-a712-48b0-baf2-fbbf37a9a49b
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, type) FROM stdin;
a118f6bb-a7a7-4754-b114-525e33638e89	Salary	BOTH
fa573ce3-1c72-4a4c-8cbe-0ee8b3ba41f7	Other	BOTH
61894fb2-6fab-4bfb-a035-974eb0b8d988	Utilities	BOTH
d5cb2c46-6d2d-4b6a-9c68-ca82f32bbd60	Subscription	BOTH
bd302bb7-937e-4e93-a787-a462ccf883c9	Auto Loan	BOTH
e36f7fe1-ba6d-4347-abc6-c9f3cd84fb3f	House	BOTH
e7c48d8d-ec36-4ea9-a361-a22462ff1c79	Loan	BOTH
7192b1cf-f71b-4674-a930-269911079501	Credit Card	BOTH
d863ef78-43e0-48d2-a0bf-14060e935a63	School	BOTH
76fee12b-1e18-4abf-ae57-13d56828cd10	Personal Expense	BOTH
1f2e47bb-3205-4f87-8cc2-d24f2067ddfa	Bills	TRANSACTION
2541e612-3619-49a0-8e3e-a32b90c1201f	Transfer	TRANSACTION
f70506ba-e1ce-4fa1-9f7d-b21177e0e49a	Shopping	TRANSACTION
\.


--
-- Data for Name: credit_cards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_cards (id, name, bank_name, bank_logo_url, last_4_digits, current_balance, credit_limit, statement_day, due_day, apr, minimum_payment_percent, notes, created_at) FROM stdin;
c702a3d4-5836-48d8-8de2-e27baeb7fbb9	Platinum Card	SNB	\N	9876	-2300.5	20000	\N	\N	\N	5	\N	\N
d7362863-0179-40fe-84dc-788dab7955d9	Visa Infinite	Jazira Bank	/banks/ajb.png	1645	15004	45000	\N	\N	\N	5		\N
b3ecda04-146a-44e4-9645-41d3c9fdfe60	Ajwa Infinite	Jazira Bank	/banks/ajb.png	4897	17466.66	0	\N	\N	\N	5		\N
aa48a105-6832-492b-a48f-fd639d39c6d4	Travel Plus	AlRajhiBank	/banks/bank2.png	7868	1585.89	0	\N	\N	\N	5		\N
\.


--
-- Data for Name: currency_wallets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.currency_wallets (id, account_id, currency_code, balance, last_updated) FROM stdin;
\.


--
-- Data for Name: loans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.loans (id, name, principal_amount, interest_rate, start_date, term_months, remaining_balance, monthly_payment, display_order, due_day, notes) FROM stdin;
968cecf4-2cce-402c-82ab-893e33afd014	Mortgage	1334598.52	2.949996478	2020-12-30	180	1334598.52	\N	1	26	\N
4b2e61aa-aeda-4b2c-9240-9959005f648a	Personal	992200	3.1	2024-05-11	60	992200	\N	0	26	\N
\.


--
-- Data for Name: obligations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.obligations (id, name, amount, due_day, category, provider, notes, display_order) FROM stdin;
0ef4388e-39b5-497a-abc1-3fdefe53a59e	OPENAI	\N	2	Subscription		this is my subscription from chatgpt	4
a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	Maid	1500	31	Salary	\N	\N	2
cd39f2d1-b735-4d09-9f97-7c9139a52dc8	Adobe	\N	4	Subscription	\N	\N	5
996098cb-7a1f-4b68-afe4-6fa38cb0d4c2	Microsoft	\N	8	Subscription	\N	\N	6
573630a7-dce3-40a7-b54f-b97d021c1503	Netflix	71	14	Subscription	\N	\N	9
40ea5e71-48ce-4bbb-945b-b83c546b8f26	Expenses	\N	25	Personal Expense	\N	\N	10
e4759a70-0dca-43db-929f-95aa619440b6	Sultan School	1300	1	School	\N	\N	11
6112fce4-57d7-4454-8071-f812287137d5	KIA	3032.19	25	Auto Loan	\N	\N	19
7672d5fb-c564-4aac-9d31-239d1112c60d	Grocery	5000	25	House	\N	\N	20
df740791-f777-43ad-81b4-6a2284b5c129	Personal	19099.85	26	Loan	\N	\N	21
658e0f17-59e9-41db-915c-542ad160faec	Mortgage	10695.33	26	Loan	\N	\N	22
275c6a76-793e-450c-831f-077d1104649a	Visa Infinite	4466.5	26	Credit Card	\N	\N	23
948d3bf9-31a7-4349-ac52-a780cc99bf8f	Ajwa Infinite	10000	26	Credit Card	\N	\N	24
7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	Mae	1800	31	Salary	\N	MAE CLAIRE	0
5f9d5e50-9dc2-4734-b963-e851c6c83c76	Norma	1500	1	Salary	\N	NORMA CAFE	1
b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	Muhammed	1800	31	Salary	\N	MOHAMMED ISLAM	3
8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	Water	402.1	4	Utilities	NWC		12
6e80c418-0538-45d8-ad3c-3fcb62207e93	My Phone	1500	4	Utilities	STC		13
05c34fbc-3023-4965-aeec-feea39c5cd5f	Quicknet	85.01	4	Utilities	STC	Biller:001\nService:STC BILL\nBill:05224907461	15
5805b7a5-eb19-4238-9efb-33332feff070	Internet	360	4	Utilities	Salam		14
07ee8383-65f7-4419-add2-db66b67f97d8	Data	67.85	28	Utilities	Zain		18
17a08cb1-1624-459f-99fa-b8a14cdd5ff0	Sarah Phone	347.5	4	Utilities	STC		16
afcc7a13-64b9-4e41-8716-0ce2e0b57a34	Electricity	1300	14	Utilities	SE		17
6ad25cce-5c21-4d3f-b773-960c3cdea7b1	Apple iCloud	\N	16	Subscription			8
3925eec8-28e8-4f40-8478-c0eb8752d83c	REALDEBR	\N	11	Subscription		this is for torrent subscription	7
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, obligation_id, payment_date, amount, note, billing_month, status, transaction_id, planned_amount) FROM stdin;
301	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.778084	3500	Bulk Import	2025-01-01	PAID	\N	\N
306	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.800018	4000	Bulk Import	2025-06-01	PAID	\N	\N
39	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:58:23.296	4500	Manual History Log	2025-10-01	PAID	\N	\N
311	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 11:31:40.532	1200	Manual History Log	2025-10-01	PAID	\N	\N
52	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 12:12:20.017	3032.19	Manual History Log	2025-12-01	PAID	\N	\N
20	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 12:12:58.888	85.01	Manual History Log	2025-12-01	PAID	\N	\N
56	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 00:51:34.741	19099.85	Manual History Log	2025-11-01	PAID	\N	\N
6	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 00:54:00.602	354.5		2025-11-01	PAID	\N	\N
71	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 10:34:17.56024	3032.19	Bulk Import	2025-08-01	PAID	\N	\N
72	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 10:34:17.564149	3032.19	Bulk Import	2025-09-01	PAID	\N	\N
7	7672d5fb-c564-4aac-9d31-239d1112c60d	2025-12-04 00:00:00	6000	Manual Manual History Log	2025-12-01	PAID	\N	\N
58	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-15 09:08:57.619	71	Manual History Log	2025-12-01	PAID	\N	\N
15	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 12:12:35.144	67.85	Manual History Log	2025-12-01	PAID	\N	\N
5	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 12:12:46.175	506.7		2025-12-01	PAID	\N	\N
28	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 12:13:08.432	439.94	Manual History Log	2025-12-01	PAID	\N	\N
37	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 12:13:24.271	2785.95	Manual History Log	2025-12-01	PAID	\N	\N
16	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-14 22:40:13.813	360	Manual History Log	2025-12-01	PAID	\N	\N
18	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-14 22:41:47.08	1200.03	Manual History Log	2025-11-01	PAID	\N	\N
19	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-14 22:41:52.349	1142.55	Manual History Log	2025-10-01	PAID	\N	\N
21	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-14 22:43:08.447	85.01	Manual History Log	2025-11-01	PAID	\N	\N
22	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-14 22:43:12.306	85.01	Manual History Log	2025-10-01	PAID	\N	\N
23	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-14 22:44:41.893	522.11	Manual History Log	2025-11-01	PAID	\N	\N
24	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-14 22:44:52.483	605.43	Manual History Log	2025-10-01	PAID	\N	\N
34	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 12:13:49.786	24215.35	Manual History Log	2025-12-01	PAID	\N	\N
26	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-14 22:57:39.694	388.38	Manual History Log	2025-10-01	PAID	\N	\N
27	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-14 22:57:47.751	361.6	Manual History Log	2025-11-01	PAID	\N	\N
29	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-14 23:42:01.723	1300	Manual History Log	2025-12-01	PAID	\N	\N
30	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-14 23:42:09.965	1300	Manual History Log	2025-11-01	PAID	\N	\N
31	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-14 23:42:23.598	1300	Manual History Log	2025-10-01	PAID	\N	\N
32	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-14 23:42:40.889	6000	Manual History Log	2025-10-01	PAID	\N	\N
33	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-14 23:42:48.517	6000	Manual History Log	2025-11-01	PAID	\N	\N
35	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-14 23:43:33.511	11162.45	Manual History Log	2025-11-01	PAID	\N	\N
36	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-14 23:43:40.429	10000	Manual History Log	2025-10-01	PAID	\N	\N
38	275c6a76-793e-450c-831f-077d1104649a	2026-01-14 23:44:02.953	2785.95	Manual History Log	2025-11-01	PAID	\N	\N
40	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-14 23:44:25.934	1500	Manual History Log	2025-12-01	PAID	\N	\N
41	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-14 23:44:28.898	1500	Manual History Log	2025-11-01	PAID	\N	\N
42	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-14 23:44:31.884	1500	Manual History Log	2025-10-01	PAID	\N	\N
43	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-14 23:44:46.395	1800	Manual History Log	2025-12-01	PAID	\N	\N
44	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-14 23:44:50.579	1800	Manual History Log	2025-11-01	PAID	\N	\N
45	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-14 23:44:57.398	1800	Manual History Log	2025-10-01	PAID	\N	\N
47	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-14 23:45:21.5	360	Manual History Log	2025-11-01	PAID	\N	\N
48	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-14 23:45:24.584	360	Manual History Log	2025-10-01	PAID	\N	\N
50	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 12:13:59.258	10695.33	Manual Payment	2025-12-01	PAID	\N	\N
51	658e0f17-59e9-41db-915c-542ad160faec	2026-01-14 23:49:22.85	10695.33	Manual Payment	2025-11-01	PAID	\N	\N
53	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 00:17:02.106	3032.19	Manual History Log	2025-11-01	PAID	\N	\N
54	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 00:17:05.288	3032.19	Manual History Log	2025-10-01	PAID	\N	\N
55	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 00:18:27.545	67.85	Manual History Log	2025-10-01	PAID	\N	\N
59	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 09:36:21.842	347.5	Manual History Log	2025-10-01	PAID	\N	\N
60	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 09:37:14.901	19099.85	Manual History Log	2025-10-01	PAID	\N	\N
61	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 09:37:24.949	10695.33	Manual History Log	2025-10-01	PAID	\N	\N
62	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-15 09:37:37.488	71	Manual History Log	2025-11-01	PAID	\N	\N
63	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-15 09:37:40.433	71	Manual History Log	2025-10-01	PAID	\N	\N
64	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-15 10:05:29.937051	1300	Bulk Import	2025-08-01	PAID	\N	\N
65	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-15 10:05:29.94159	1300	Bulk Import	2025-09-01	PAID	\N	\N
13	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:29:44.736	67.85	Manual History Log	2025-11-01	PAID	\N	\N
14	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:29:52.749	67.85	Manual History Log	2025-09-01	PAID	\N	\N
57	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 12:14:10.655	19099.85	Manual Payment	2025-12-01	PAID	\N	\N
70	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 10:34:17.555764	3032.19	Bulk Import	2025-07-01	PAID	\N	\N
75	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.576117	1800	Bulk Import	2025-01-01	PAID	\N	\N
76	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.579245	1800	Bulk Import	2025-02-01	PAID	\N	\N
77	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.58288	1800	Bulk Import	2025-03-01	PAID	\N	\N
78	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.586305	1800	Bulk Import	2025-04-01	PAID	\N	\N
79	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.589482	1800	Bulk Import	2025-05-01	PAID	\N	\N
80	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.592703	1800	Bulk Import	2025-06-01	PAID	\N	\N
81	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.595921	1800	Bulk Import	2025-07-01	PAID	\N	\N
82	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.59903	1800	Bulk Import	2025-08-01	PAID	\N	\N
338	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 18:01:17.896	3200	Manual Payment	2025-01-01	PAID	\N	\N
17	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 19:37:19.84	1200.03		2025-12-01	PAID	\N	\N
83	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.602165	1800	Bulk Import	2025-09-01	PAID	\N	\N
88	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.619774	2000	Bulk Import	2025-08-01	PAID	\N	\N
93	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.636738	1500	Bulk Import	2025-04-01	PAID	\N	\N
98	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.65355	67.85	Bulk Import	2025-02-01	PAID	\N	\N
103	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.670456	68.14	Bulk Import	2025-07-01	PAID	\N	\N
108	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.686601	937.08	Bulk Import	2025-03-01	PAID	\N	\N
113	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.703673	1067.06	Bulk Import	2025-08-01	PAID	\N	\N
118	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.720535	360	Bulk Import	2025-04-01	PAID	\N	\N
123	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.736652	360	Bulk Import	2025-09-01	PAID	\N	\N
128	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.752515	132.09	Bulk Import	2025-05-01	PAID	\N	\N
133	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.769088	881.68	Bulk Import	2025-01-01	PAID	\N	\N
138	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.785965	2240.49	Bulk Import	2025-06-01	PAID	\N	\N
143	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.802588	21.62	Bulk Import	2025-02-01	PAID	\N	\N
148	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.819784	1011.12	Bulk Import	2025-07-01	PAID	\N	\N
153	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.8365	4604.65	Bulk Import	2025-03-01	PAID	\N	\N
158	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.853047	4466.5	Bulk Import	2025-08-01	PAID	\N	\N
163	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.869068	10695.33	Bulk Import	2025-01-01	PAID	\N	\N
168	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.885135	10695.33	Bulk Import	2025-06-01	PAID	\N	\N
173	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.900684	19099.85	Bulk Import	2025-02-01	PAID	\N	\N
178	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.91638	19099.85	Bulk Import	2025-07-01	PAID	\N	\N
302	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.783884	4000	Bulk Import	2025-02-01	PAID	\N	\N
307	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.80345	5000	Bulk Import	2025-07-01	PAID	\N	\N
339	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 19:26:44.22	1095.43	Manual Payment	2025-12-01	PAID	\N	\N
84	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.605425	1800	Bulk Import	2025-04-01	PAID	\N	\N
89	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.623176	1800	Bulk Import	2025-09-01	PAID	\N	\N
94	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.639879	1500	Bulk Import	2025-05-01	PAID	\N	\N
99	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.657331	67.85	Bulk Import	2025-03-01	PAID	\N	\N
104	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.67371	67.85	Bulk Import	2025-08-01	PAID	\N	\N
109	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.689883	949.44	Bulk Import	2025-04-01	PAID	\N	\N
114	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.707141	1194.54	Bulk Import	2025-09-01	PAID	\N	\N
119	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.723787	360	Bulk Import	2025-05-01	PAID	\N	\N
124	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.739749	85.01	Bulk Import	2025-01-01	PAID	\N	\N
129	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.75581	85.01	Bulk Import	2025-06-01	PAID	\N	\N
134	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.772389	575.83	Bulk Import	2025-02-01	PAID	\N	\N
139	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.78924	2431.59	Bulk Import	2025-07-01	PAID	\N	\N
144	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.805946	43.04	Bulk Import	2025-03-01	PAID	\N	\N
149	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.823129	591.61	Bulk Import	2025-08-01	PAID	\N	\N
154	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.839825	4600	Bulk Import	2025-04-01	PAID	\N	\N
159	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.856319	4466.5	Bulk Import	2025-09-01	PAID	\N	\N
164	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.872222	10695.33	Bulk Import	2025-02-01	PAID	\N	\N
169	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.888175	10695.33	Bulk Import	2025-07-01	PAID	\N	\N
174	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.903806	19099.85	Bulk Import	2025-03-01	PAID	\N	\N
179	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.919517	19099.85	Bulk Import	2025-08-01	PAID	\N	\N
303	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.788212	4000	Bulk Import	2025-03-01	PAID	\N	\N
308	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.80717	5000	Bulk Import	2025-08-01	PAID	\N	\N
85	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.60948	1875	Bulk Import	2025-05-01	PAID	\N	\N
95	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.643602	1500	Bulk Import	2025-06-01	PAID	\N	\N
100	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.660728	68.14	Bulk Import	2025-04-01	PAID	\N	\N
304	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.791941	4000	Bulk Import	2025-04-01	PAID	\N	\N
110	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.69326	991.59	Bulk Import	2025-05-01	PAID	\N	\N
115	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.710629	306	Bulk Import	2025-01-01	PAID	\N	\N
120	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.72699	360	Bulk Import	2025-06-01	PAID	\N	\N
125	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.742932	85.01	Bulk Import	2025-02-01	PAID	\N	\N
130	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.75926	85.01	Bulk Import	2025-07-01	PAID	\N	\N
135	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.775764	744	Bulk Import	2025-03-01	PAID	\N	\N
140	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.792515	2035.33	Bulk Import	2025-08-01	PAID	\N	\N
145	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.809451	125.19	Bulk Import	2025-04-01	PAID	\N	\N
150	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.826469	402.1	Bulk Import	2025-09-01	PAID	\N	\N
155	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.843192	4555.67	Bulk Import	2025-05-01	PAID	\N	\N
160	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 10:34:17.859573	10000	Bulk Import	2025-07-01	PAID	\N	\N
165	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.875291	10695.33	Bulk Import	2025-03-01	PAID	\N	\N
170	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.891227	10695.33	Bulk Import	2025-08-01	PAID	\N	\N
175	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.90696	19099.85	Bulk Import	2025-04-01	PAID	\N	\N
180	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.922698	19099.85	Bulk Import	2025-09-01	PAID	\N	\N
309	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.810771	5000	Bulk Import	2025-09-01	PAID	\N	\N
312	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 11:32:08.468	1200	Manual History Log	2025-09-01	PAID	\N	\N
347	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-18 14:44:32.322	1200.03	Budgeted Amount	2026-01-01	BUDGET	\N	\N
86	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.612974	1875	Bulk Import	2025-06-01	PAID	\N	\N
91	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.630133	1500	Bulk Import	2025-02-01	PAID	\N	\N
96	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.647236	1500	Bulk Import	2025-07-01	PAID	\N	\N
101	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.663907	67.85	Bulk Import	2025-05-01	PAID	\N	\N
106	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.680105	934.09	Bulk Import	2025-01-01	PAID	\N	\N
111	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.69679	934.09	Bulk Import	2025-06-01	PAID	\N	\N
116	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.714096	306	Bulk Import	2025-02-01	PAID	\N	\N
121	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.730226	360	Bulk Import	2025-07-01	PAID	\N	\N
126	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.746088	85.01	Bulk Import	2025-03-01	PAID	\N	\N
131	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.762532	85.01	Bulk Import	2025-08-01	PAID	\N	\N
136	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.779067	1183.11	Bulk Import	2025-04-01	PAID	\N	\N
141	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.795901	1130.36	Bulk Import	2025-09-01	PAID	\N	\N
146	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.812918	132.09	Bulk Import	2025-05-01	PAID	\N	\N
151	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.829935	4663.96	Bulk Import	2025-01-01	PAID	\N	\N
156	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.846417	4695.51	Bulk Import	2025-06-01	PAID	\N	\N
161	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 10:34:17.862763	10000	Bulk Import	2025-08-01	PAID	\N	\N
166	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.878738	10695.33	Bulk Import	2025-04-01	PAID	\N	\N
171	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.894461	10695.33	Bulk Import	2025-09-01	PAID	\N	\N
176	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.91002	19099.85	Bulk Import	2025-05-01	PAID	\N	\N
305	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.795858	4000	Bulk Import	2025-05-01	PAID	\N	\N
87	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.616428	1875	Bulk Import	2025-07-01	PAID	\N	\N
92	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.633523	1500	Bulk Import	2025-03-01	PAID	\N	\N
97	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.650399	67.85	Bulk Import	2025-01-01	PAID	\N	\N
102	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.667163	69.58	Bulk Import	2025-06-01	PAID	\N	\N
107	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.683383	938.69	Bulk Import	2025-02-01	PAID	\N	\N
112	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.700365	934.09	Bulk Import	2025-07-01	PAID	\N	\N
117	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.717405	306	Bulk Import	2025-03-01	PAID	\N	\N
122	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.733474	360	Bulk Import	2025-08-01	PAID	\N	\N
127	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.749355	85.01	Bulk Import	2025-04-01	PAID	\N	\N
132	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.765882	85.01	Bulk Import	2025-09-01	PAID	\N	\N
137	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.782455	1846.76	Bulk Import	2025-05-01	PAID	\N	\N
142	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.799262	24.2	Bulk Import	2025-01-01	PAID	\N	\N
147	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.816317	582.85	Bulk Import	2025-06-01	PAID	\N	\N
152	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.833201	4663.96	Bulk Import	2025-02-01	PAID	\N	\N
157	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.849769	4561.51	Bulk Import	2025-07-01	PAID	\N	\N
162	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 10:34:17.865868	10000	Bulk Import	2025-09-01	PAID	\N	\N
167	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.881887	10695.33	Bulk Import	2025-05-01	PAID	\N	\N
172	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.897531	19099.85	Bulk Import	2025-01-01	PAID	\N	\N
177	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.913136	19099.85	Bulk Import	2025-06-01	PAID	\N	\N
310	5f9d5e50-9dc2-4734-b963-e851c6c83c76	2026-01-15 11:30:29.353	1500	Manual Payment	2025-12-01	PAID	\N	\N
229	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 11:53:32.18	530.77	Bulk Import	2025-04-01	PAID	\N	\N
226	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.816842	307.62	Bulk Import	2025-01-01	PAID	\N	\N
227	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.82019	345	Bulk Import	2025-02-01	PAID	\N	\N
228	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.823434	549.43	Bulk Import	2025-03-01	PAID	\N	\N
230	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.830323	304.51	Bulk Import	2025-05-01	PAID	\N	\N
231	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.833714	304.51	Bulk Import	2025-06-01	PAID	\N	\N
232	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.837066	304.51	Bulk Import	2025-07-01	PAID	\N	\N
233	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.840278	304.51	Bulk Import	2025-08-01	PAID	\N	\N
234	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.84341	347.5	Bulk Import	2025-09-01	PAID	\N	\N
357	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-18 14:44:02.119	1800	Budgeted Amount	2026-01-01	BUDGET	\N	\N
356	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-18 14:42:40.952	71	Budgeted Amount	2026-01-01	BUDGET	\N	\N
350	5f9d5e50-9dc2-4734-b963-e851c6c83c76	2026-01-18 14:43:47.951	1500	Budgeted Amount	2026-01-01	BUDGET	\N	\N
349	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-18 14:45:37.352	22871.84	Budgeted Amount	2026-01-01	BUDGET	\N	\N
346	275c6a76-793e-450c-831f-077d1104649a	2026-01-18 14:45:41.397	5763.22	Budgeted Amount	2026-01-01	BUDGET	\N	\N
355	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-18 14:43:52.406	1500	Budgeted Amount	2026-01-01	BUDGET	\N	\N
359	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-18 14:44:23.035	439.94	Budgeted Amount	2026-01-01	BUDGET	\N	\N
352	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-17 22:11:18.901	0	Draft Amount	2025-12-01	BUDGET	\N	\N
358	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-18 14:44:18.619	1300	Budgeted Amount	2026-01-01	BUDGET	\N	\N
360	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-18 14:44:37.99	85.01	Budgeted Amount	2026-01-01	BUDGET	\N	\N
361	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-18 14:44:50.622	506.7	Budgeted Amount	2026-01-01	BUDGET	\N	\N
348	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-18 14:44:46.33	360	Budgeted Amount	2026-01-01	BUDGET	\N	\N
362	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-18 14:44:54.688	67.85	Budgeted Amount	2026-01-01	BUDGET	\N	\N
363	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-18 14:44:58.979	1095.43	Budgeted Amount	2026-01-01	BUDGET	\N	\N
365	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-18 14:45:13.984	6000	Budgeted Amount	2026-01-01	BUDGET	\N	\N
366	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-18 14:45:23.773	19099.85	Budgeted Amount	2026-01-01	BUDGET	\N	\N
367	658e0f17-59e9-41db-915c-542ad160faec	2026-01-18 14:45:27.851	10695.33	Budgeted Amount	2026-01-01	BUDGET	\N	\N
369	40ea5e71-48ce-4bbb-945b-b83c546b8f26	2026-01-21 18:52:37.564	0	Budgeted Amount	2025-12-01	BUDGET	\N	\N
370	3925eec8-28e8-4f40-8478-c0eb8752d83c	2026-01-21 23:21:35.288	18	Budgeted Amount	2026-01-01	BUDGET	\N	\N
371	996098cb-7a1f-4b68-afe4-6fa38cb0d4c2	2026-01-21 23:21:48.994	54.55	Budgeted Amount	2026-01-01	BUDGET	\N	\N
372	6ad25cce-5c21-4d3f-b773-960c3cdea7b1	2026-01-21 23:21:53.929	12.99	Budgeted Amount	2026-01-01	BUDGET	\N	\N
351	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-22 23:44:27.549	0	Budgeted Amount	2026-01-01	BUDGET	\N	\N
373	40ea5e71-48ce-4bbb-945b-b83c546b8f26	2026-01-27 21:52:02.613	100	Budgeted Amount	2025-10-01	BUDGET	\N	100
368	40ea5e71-48ce-4bbb-945b-b83c546b8f26	2026-01-27 23:05:18.788	200	Budgeted Amount	2026-01-01	BUDGET	\N	\N
364	6112fce4-57d7-4454-8071-f812287137d5	2026-01-27 23:49:04.00553	3032.19	Linked to: Loan Instalment	2026-01-01	PAID	\N	3032.19
\.


--
-- Data for Name: raw_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.raw_messages (id, sender, body, "timestamp", status, error_log) FROM stdin;
5d53dafe-1391-4db2-b892-66a6a6f19415	Telegram-Channel_-1003635708322	OTP Code:3894\nReason:Local Transfer - Mobile App\nAmount:350.00 SAR	2026-01-22 03:42:29.722508	PARSED	\N
da9d4579-dd8c-43e2-b49e-6f94e58a4d51	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-22 03:49:01.726951	PARSED	\N
9e720e5e-bda4-44a6-bba3-d0f8999617e3	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 0.04\nTo: 1505\n26/1/22 13:46	2026-01-22 13:46:41.363773	PARSED	\N
7dadebb2-129a-4b3f-b2d7-358d40fe6117	Telegram-Channel_-1003635708322	Online Purchase\nCard:7868 ;Visa\nAmount:31.29 USD\nAt: ADOBE *8\nCountry:USA\nBalance:3.73 USD\nDate:06-01-2026 14:59	2026-01-22 14:02:07.066555	PARSED	\N
99b236ce-864f-4f11-82d9-4fb5a10f04aa	Telegram-Channel_-1003635708322	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 71\nMerchant : NETFLIX.C\nDate : 22/1/26 17:40	2026-01-22 17:40:53.762025	PARSED	Transaction Declined (Not added to ledger)
c97958eb-b951-4d81-b523-100c809610f2	Telegram-Channel_-1003635708322	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-22 18:51 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	2026-01-22 18:51:52.926899	PARSED	\N
bedc7a7c-233f-45ab-8937-3a1d597e1492	Telegram-Channel_-1003635708322	One Time Password\nCode: 5565\nReason: To Transfer Via Instant Payment Service\nBeneficiary: MYACCRAJHI\nAmount: 1000.00 SAR\nDate: 2026-01-22 20:34	2026-01-22 20:34:13.070435	PARSED	\N
fae7019a-0d09-46cd-b664-200ff65b1c87	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-22 20:34:35.897088	PARSED	\N
7485bd5f-f27a-4c6f-be0f-8e9386803b46	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-22 20:34:46.303273	PARSED	\N
83a5f58d-aa04-47d8-a6f3-d76afa27ea65	Telegram-Channel_-1003635708322	OTP Code:6238\nReason:Rajhi Transfer - Mobile App\nAmount:540.00 SAR	2026-01-22 20:43:21.807994	PARSED	\N
4b98000a-3222-4bae-b2f5-7a0d39525dbd	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 540\nTo:MOHAMMED ISLAM\nTo:0477\n26/1/22 20:43	2026-01-22 20:43:32.024228	PARSED	\N
4d5fd86d-41c2-4128-a8db-e0e0e7b22816	Telegram-Channel_-1003635708322	OTP Code:9957\nReason:Rajhi Transfer - Mobile App\nAmount:250.00 SAR	2026-01-22 21:03:08.474436	PARSED	\N
86986e08-67aa-463a-b6ae-e5c76bcb0e15	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-22 21:03:21.28021	PARSED	\N
04199164-e787-4b4c-a7a1-c721f3c2ec56	Telegram-Channel_-1003635708322	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Back comfort trading comp \nof: 1263.80 SAR \non : 2026-01-22 22:06 \nAvailable Balance: 21839.24 SAR \nDue Amount: 51896.96 SAR	2026-01-22 22:06:50.269952	PARSED	\N
22aefb59-cd80-4f35-8287-18740ac0c2e0	Telegram-Channel_-1003635708322	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :URTH CAFFE KAFD \nof: 86.00 SAR \non : 2026-01-22 22:46 \nAvailable Balance: 21753.24 SAR \nDue Amount: 51896.96 SAR	2026-01-22 22:46:21.39226	PARSED	\N
a19b467c-8a7a-46ea-81e9-e42011649611	Telegram-Channel_-1003635708322	Online Purchase Apple Pay Credit Card: 4897 at :q-Rowleys of : 683.90 SAR on : 2026-01-23 00:37 Available Balance is: 21069.34 SAR Due Amount: 51896.96 SAR	2026-01-23 00:37:53.952787	PARSED	\N
783c794c-2c98-4112-8bc8-0dd51df0879e	Telegram-Channel_-1003635708322	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : USD 14.99\nMerchant : AMAZON PR\nDate : 23/1/26 4:51	2026-01-23 04:51:30.604329	FAILED	400 API key expired. Please renew the API key. [reason: "API_KEY_INVALID"\ndomain: "googleapis.com"\nmetadata {\n  key: "service"\n  value: "generativelanguage.googleapis.com"\n}\n, locale: "en-US"\nmessage: "API key expired. Please renew the API key."\n]
5b48d943-100f-4e1a-8e80-ee8b0e0bb821	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 11:40:19.429998	FAILED	400 API key expired. Please renew the API key. [reason: "API_KEY_INVALID"\ndomain: "googleapis.com"\nmetadata {\n  key: "service"\n  value: "generativelanguage.googleapis.com"\n}\n, locale: "en-US"\nmessage: "API key expired. Please renew the API key."\n]
36d56d40-4060-4696-a871-071b1190cf30	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 11:48:50.473918	FAILED	400 API key expired. Please renew the API key. [reason: "API_KEY_INVALID"\ndomain: "googleapis.com"\nmetadata {\n  key: "service"\n  value: "generativelanguage.googleapis.com"\n}\n, locale: "en-US"\nmessage: "API key expired. Please renew the API key."\n]
47dc4610-2d86-4c25-8cee-430433c79611	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 12:41:19.435475	PARSED	\N
5162bf23-393a-4a41-914d-875f4ea79fc2	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 13:17:01.418756	PARSED	\N
43e7ac4a-6db3-4e8d-bdca-914f6173b704	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:17:32.178759	PARSED	\N
7da9f9e7-5dba-4223-a725-7eba6fd1b1d0	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:22:51.553784	PARSED	\N
29acca33-bdfb-4492-a73d-0a9d127aca79	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:31:54.306698	PARSED	\N
e796d7c0-a1eb-41f3-a88e-244e1c73cd49	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:33:54.212196	PARSED	\N
a9dedd4b-2e21-4787-bc35-cb1daf49386b	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:40:44.987392	PARSED	\N
3abf1105-51b8-4a0a-af62-f9c89f485daa	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:42:18.536146	PARSED	\N
fe9e4570-224c-4ad8-a452-0cbe9d0aaafe	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:49:15.266321	PARSED	\N
9ec3d04d-6dd4-4dde-ba49-07198e685369	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:50:42.67404	PARSED	\N
cee58ef8-02d2-4160-bccc-d22455630b3d	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:55:02.844837	PARSED	\N
af46148f-5282-420a-ada2-8f6a8c235d57	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:59:01.904362	PARSED	\N
238396de-adf2-42d9-bd8c-6774d5d524b8	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:00:00.965521	PARSED	\N
041b6b0d-3c28-499b-888e-aa00a1207190	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 14:01:37.560338	PARSED	\N
977e9b11-a2d9-4ed8-93c5-dc0166d17103	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:02:18.203885	PARSED	\N
08ba11d3-1b05-4ba6-b3ed-32d3679adbee	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 14:10:11.736961	PARSED	\N
3d7be69c-55bf-40e2-a4f7-bc1780750efe	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:10:56.146652	PARSED	\N
794b0404-c5ce-449f-93a4-bdbcd58d8563	Telegram-Channel_-1003635708322	Disliked “Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021”	2026-01-23 14:14:32.972378	PARSED	\N
72f6567e-9e89-4be5-8102-6b3b67905e10	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 14:14:36.11296	PARSED	\N
7168cb4b-c24f-4680-bd11-886df8f0450d	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:14:55.018881	PARSED	\N
dd88a1bf-1849-44bc-a920-fd8d9515f9e3	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 52\nAt:FUTURE ID\n23/1/26 17:51	2026-01-23 17:51:42.650677	PARSED	\N
787c14a6-9bf0-4c26-ba76-499a7fe21acd	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 8\nAt:FUTURE ID\n23/1/26 17:55	2026-01-23 17:55:36.533613	PARSED	\N
8ac5f283-bddc-4588-bfab-016afc6a9fd2	Telegram-Channel_-1003635708322	Credit Transfer Internal\nAmount:SAR 500\nTo:7772\nFrom:ABDULRHMAN ALASIRI\nFrom:1998\n26/1/23 19:19	2026-01-23 19:20:00.578891	PARSED	\N
44d7d6ef-19d3-413c-8666-4222789012ac	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:23:39.601653	PARSED	\N
4846a5a0-d116-48d8-8d2d-0490bd918403	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 19:24:26.972151	PARSED	\N
0b36910f-6500-4d47-a6e0-6ee792828d0b	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:48:02.615335	PARSED	\N
fb820c59-6283-45f0-83f4-ed5ccc00e051	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:48:39.666959	PARSED	\N
ef0491fb-783a-4b4c-a839-e999ee243b84	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:50:41.684812	PARSED	\N
c8f4930d-2dc2-4a69-8a48-2beb2ecf981d	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 44\nAt:Sasco Pal\n24/1/26 20:38	2026-01-23 20:38:27.900705	PARSED	\N
7a7995b0-fe93-42a3-9fcf-2af31fc1157d	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-24 01:18:07.175382	PARSED	\N
f4be4c7f-59bd-44a5-bacd-431316d56290	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-24 01:18:55.683329	PARSED	\N
93da7376-6cf1-48b7-960f-42983bcbc94a	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-24 01:19:29.620773	PENDING	\N
b6d7a1f6-a472-4d7d-899f-2cdc1f20a138	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:21\nRef: 2BTMS12034841021	2026-01-24 01:21:39.99036	PARSED	\N
45191a70-7b31-460e-8d8b-be3cbb56e2ba	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:21	2026-01-24 01:22:06.041907	PENDING	\N
6094d1ce-b8f1-411b-88d3-3ea3f44cc251	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	2026-01-24 01:34:32.612616	PENDING	\N
48d2580a-52a9-4ac6-827b-4848dfd8aab5	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	2026-01-24 01:34:54.531602	PENDING	\N
f82d6a8a-2f9f-4805-8d60-751b9b90f5ca	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	2026-01-24 01:39:42.005677	PARSED	\N
349caa68-cc8f-4d62-9ce7-18f92df648aa	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:46\nRef: 2BTMS12034841021	2026-01-24 01:47:14.363049	PARSED	\N
5e7d8f05-0724-4ea0-a24e-6af94fb5a885	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:47	2026-01-24 01:47:39.099658	PARSED	\N
5c65c2ea-8bf3-4e61-b812-7f6e0bb5e347	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1000\nTo: 1505\n26/1/24 1:49	2026-01-24 01:49:59.213256	PARSED	\N
679d4540-d5d2-48c6-9c06-e62c3240736e	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 01:51:45.504214	PARSED	\N
63c854bc-6cb0-4648-8361-a4045161642d	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 01:58:23.863944	PARSED	\N
ced853e6-1376-432d-a018-564479b3846c	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 02:04:04.857782	PARSED	\N
8a6122d8-f60c-4b1a-9589-905cdbf0e691	Telegram-Channel_-1003635708322	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-24 02:13 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	2026-01-24 02:13:11.906466	PARSED	\N
0312f2ce-f638-4b43-a993-faf1d70692de	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 02:19:53.749286	PARSED	\N
3758711b-5189-4df9-8727-d1448fd06fef	Unknown	Id	2026-01-28 14:16:41.218751	FAILED	AI determined not a financial event
71ab1ef6-136d-43f4-85a5-1a4b567d54d2	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1500\nTo: 1505\n26/1/24 2:19	2026-01-24 02:21:05.02235	PARSED	\N
b0a87174-f6ca-4115-93b0-2ce931d31bc9	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:27	2026-01-24 02:27:28.08365	PARSED	\N
48c98c97-c6cc-4cb1-a732-7c3b2f5bce41	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:31	2026-01-24 02:31:24.192041	PARSED	\N
db22bbd2-3473-4cbc-bd48-f5d21fbcfa3e	Telegram-Channel_-1003635708322	AlRajhiBankTransfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:38	2026-01-24 02:38:45.846842	PARSED	\N
fd4a6e57-5081-4a8c-b316-08efa511efe9	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 03:00:56.755268	PARSED	\N
5b48e13d-8f34-400a-983d-6909639e39aa	Telegram-Channel_-1003635708322	Sender: AlrajhiBank\nTransfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19	2026-01-24 03:03:45.143569	PARSED	\N
a7ff96ca-15e0-4800-b639-5262d092acbf	Telegram-Channel_-1003635708322	AlrajhiBank\nTransfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19	2026-01-24 03:03:59.479092	PARSED	\N
343eb940-1d26-4095-a13b-c866343bc94e	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 03:09:10.020979	PARSED	\N
07d72d58-1693-4113-8930-da4ea8135ede	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 03:09:44.8728	PARSED	\N
a3c5aaba-4a17-42db-89eb-e11141a976ac	Telegram-Channel_-1003635708322	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Tabby \nof: 614.21 SAR \non : 2026-01-24 05:53 \nAvailable Balance: 20455.13 SAR \nDue Amount: 51896.96 SARJazira Bank	2026-01-24 05:53:09.526345	PARSED	\N
6993cbc9-b1b4-40f7-9c9a-868db7f0295b	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 122\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 10:54:23.133793	PARSED	\N
015b0cee-89b3-4766-9f26-df92d547f1ec	Telegram-Channel_-1003635708322	OTP Code:0498\nReason:Rajhi Transfer - Mobile App\nAmount:440.00 SARAlRajhiBank	2026-01-26 15:03:12.671048	FAILED	Unknown Account
badbc5d5-1b16-467f-b778-ae85f4dffd83	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:1505\nAmount:SAR 440\nTo:MOHAMMED ISLAM\nTo:0477\n26/1/26 15:03AlRajhiBank	2026-01-26 15:03:26.797386	PENDING	\N
88425949-b0d8-4109-8736-b8adaf8cd4dd	Telegram-Channel_-1003635708322	Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 195\nAt:Yazysa\n26/1/26 16:23AlRajhiBank	2026-01-26 16:22:57.593896	PENDING	\N
5fa08370-bda7-40c0-857d-08018a0d1756	Telegram-Channel_-1003635708322	OTP Code:7317\nReason:Rajhi Transfer - Mobile App\nAmount:200.00 SARAlRajhiBank	2026-01-26 17:22:16.796439	FAILED	Unknown Account
ebf51eed-4737-4aa9-b260-284cd9c56188	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:1505\nAmount:SAR 200\nTo:SABAH ABDULLAH\nTo:0450\n26/1/26 17:22AlRajhiBank	2026-01-26 17:22:37.931904	PENDING	\N
b2636c2e-144a-42e2-b345-6ab86d3c4b07	Telegram-Channel_-1003635708322	Debit transfer: Loan Instalment\nFrom: 8001\nInstalment: SAR 19,099.85\nRemaining Amount: SAR 744,894.15\nFor: Personal Loan\nDate: 2026-01-26 17:23Jazira Bank	2026-01-26 17:23:25.332022	PENDING	\N
3d3a6ca7-c774-4601-923c-38022320bd94	Telegram-Channel_-1003635708322	Online Purchase\nBy:4390;mada-Apple Pay\nFrom:2104\nAmount:SAR 112.50\nAt:Keeta\n26/1/26 17:26AlRajhiBank	2026-01-26 17:25:52.431426	PENDING	\N
643da36e-af2e-44b5-94ad-1e0da7fe2072	Telegram-Channel_-1003635708322	Online Purchase\nBy:4390;mada-Apple Pay\nFrom:2104\nAmount:SAR 112.50\nAt:Keeta\n26/1/26 17:26AlRajhiBank	2026-01-26 17:25:54.947206	PENDING	\N
e7bb7a61-3a18-4846-8099-6110d2a07994	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 23.65\nAt:MEED Jawh\n26/1/26 19:52AlRajhiBank	2026-01-26 19:51:54.82318	PENDING	\N
4850c44b-4cb6-4b47-90ad-df3ae04e0816	Telegram-Channel_-1003635708322	Bill Payment\nFrom:9384\nAmount:SAR 85.01\nBiller:001\nService:STC BILL\nBill:05224907461\nDate:26-1-24 13:24+966566985112	2026-01-26 22:44:11.117637	PARSED	\N
fe80655b-ea7a-421d-86c3-5bd8bcad8b13	Telegram-Channel_-1003635708322	Online Purchase\nBy:4390;mada-Apple Pay\nFrom:2104\nAmount:SAR 36\nAt:Jahez\n27/1/26 23:16AlRajhiBank	2026-01-26 23:16:40.737525	PARSED	\N
afe6fc6b-812d-4709-82d5-cb693b1a1031	Telegram-Channel_-1003635708322	Online Purchase\nBy:4390;mada-Apple Pay\nFrom:2104\nAmount:SAR 36\nAt:Jahez\n27/1/26 23:16AlRajhiBank	2026-01-26 23:16:44.532339	PARSED	\N
58e27091-0ea8-490e-8738-c3902ba0725d	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34+966566985112	2026-01-27 08:20:49.097122	PARSED	\N
09d742c4-a3d9-4336-bab0-e792c81c8c7d	Telegram-Channel_-1003635708322	Bill Payment\nFrom:9384\nAmount:SAR 85.01\nBiller:001\nService:STC BILL\nBill:05224907461\nDate:26-1-24 13:24+966566985112	2026-01-27 09:03:24.056062	PARSED	\N
4f59fb0e-e54b-46c9-8a47-3f2b00938ef4	Telegram-Channel_-1003635708322	Bill Payment\nFrom:9384\nAmount:SAR 85.01\nBiller:001\nService:STC BILL\nBill:05224907461\nDate:26-1-24 13:24+966566985112	2026-01-27 09:10:15.722587	PARSED	\N
78c34845-7d05-4084-a196-e50d7f94ebcd	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48+966566985112	2026-01-27 09:42:07.651613	PARSED	\N
05f52633-d2eb-4916-a215-be473d0afd04	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48+966566985112	2026-01-27 09:42:54.546437	PARSED	\N
9712e9dc-3d4f-49a5-9592-78d848a58d89	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 97\nAt:Five Guys\n12/1/26 13:47+966566985112	2026-01-27 09:43:34.673787	PARSED	\N
b99e53d1-285b-408e-ab56-f7a25268104b	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 10000\nTo: 1505\n26/1/25 17:49+966566985112	2026-01-27 09:44:17.50266	PARSED	\N
a3f71783-ca08-45ac-8a20-61df734a5fdd	Telegram-Channel_-1003635708322	Online Purchase Apple Pay Credit Card: 4897 at :Tamara of : 2533.34 SAR on : 2026-01-27 10:48 Available Balance is: 16559.80 SAR Due Amount: 55842.86 SARJazira Bank	2026-01-27 10:48:26.764274	PARSED	\N
5e3b4947-5299-4f2d-ab81-c2710ce22922	Telegram-Channel_-1003635708322	Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 400\nAt:STC Bank\n27/1/26 11:11AlRajhiBank	2026-01-27 11:11:01.560069	PARSED	\N
393efe77-7dfc-4daa-856f-df74276465cd	Telegram-Channel_-1003635708322	4627 is your OTP\nFor: Transfer to contact\nAmount: 400.00 SAR\n*Do not share the codeSTC Bank	2026-01-27 11:11:50.409869	FAILED	Unknown Account
4f11a6b9-1bc2-408e-b259-d4783f80936b	Telegram-Channel_-1003635708322	Internal outward transfer\nAmount:400.00SAR\nTo:MOHAMED ABDELSATTAR\nAcc:3607*\nAt:27/01/26 11:12STC Bank	2026-01-27 11:11:55.83841	FAILED	Unknown Account
a5582773-a410-4f70-91cf-9ec8859e0e37	Telegram-Channel_-1003635708322	OTP Code:5363\nReason:Rajhi Transfer - Mobile App\nAmount:1,500.00 SARAlRajhiBank	2026-01-27 11:15:08.058337	FAILED	Unknown Account
759a8489-0570-41e4-ad08-c6fc921af5db	AlRajhiBank	Online Purchase\nBy:4390;mada-Apple Pay\nFrom:2104\nAmount:SAR 52.45\nAt:Keemart\n28/1/26 14:28AlRajhiBank	2026-01-28 14:28:29.39399	PARSED	\N
f8304872-8f2d-4021-8cc8-8b7387b580ac	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:1505\nAmount:SAR 1500\nTo:MUHAMMAD AKRAM\nTo:1967\n26/1/27 11:15AlRajhiBank	2026-01-27 11:15:20.302999	PARSED	\N
739b2bc5-d43a-4b93-a361-a1da4d749fdf	Telegram-Channel_-1003635708322	PoS\nBy:4390;mada-Atheer\nAmount:SAR 531.16\nAt:BERAIN CO \n27/1/26 11:59AlRajhiBank	2026-01-27 11:59:20.600304	PARSED	\N
451c421e-94b0-4575-989c-a90821066500	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 7\nAt:GOT COOKI\n27/1/26 12:39AlRajhiBank	2026-01-27 12:39:28.297681	PARSED	\N
0b1c8d3a-c330-4ac7-9ad9-924f91acf52c	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 7\nAt:GOT COOKI\n27/1/26 15:22AlRajhiBank	2026-01-27 15:22:16.789789	PARSED	\N
655687b7-43c3-41f5-a92a-9f608b5f9c1d	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 16\nAt:CITY FRES\n27/1/26 15:23AlRajhiBank	2026-01-27 15:23:06.122259	PARSED	\N
40343036-14cc-46ae-8acc-49376e142bb4	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 50\nAt:HABIBAH S\n28/1/26 20:41AlRajhiBank	2026-01-27 20:41:40.083483	PARSED	\N
11f74ff3-81e1-4dc4-91ee-061c2aeeb185	Telegram-Channel_-1003635708322	PoS\nBy:4390;mada-Apple Pay\nAmount:SAR 36\nAt:HABIBAH S\n28/1/26 21:01AlRajhiBank	2026-01-27 21:01:22.034894	PARSED	\N
07eb3700-5bba-48cf-9685-975b9a98531d	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 47.65\nAt:Alsawadi R\n28/1/26 21:07AlRajhiBank	2026-01-27 21:06:59.399809	PARSED	\N
ab2895f2-0fe7-4a31-a13f-c1c178607928	Telegram-Channel_-1003635708322	Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 539.99\nBalance:539.99 SAR\n27/1/26 22:45AlRajhiBank	2026-01-27 22:44:58.825502	PARSED	\N
93b85bbc-8ee9-4070-85e0-750818471953	Telegram-Channel_-1003635708322	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 539.99\nMerchant : Google On\nDate : 27/1/26 22:45AlRajhiBank	2026-01-27 22:45:02.101403	PARSED	\N
49d5fbf9-622c-46cc-837f-1bd58f3c351f	Telegram-Channel_-1003635708322	Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 1\nBalance:540.99 SAR\n27/1/26 22:46AlRajhiBank	2026-01-27 22:45:48.956912	PARSED	\N
8cf2022c-a3c0-447f-8c2d-2c74cdd0bfd3	Telegram-Channel_-1003635708322	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 539.99\nMerchant : GOOGLE*GO\nDate : 27/1/26 22:46AlRajhiBank	2026-01-27 22:46:09.263872	PARSED	\N
b1f95e97-ef93-4699-bdb1-4434a08b6aa7	Telegram-Channel_-1003635708322	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 539.99\nMerchant : Google On\nDate : 27/1/26 22:46AlRajhiBank	2026-01-27 22:46:11.797115	PARSED	\N
779fbc36-0579-4909-bd13-d3a958855646	Telegram-Channel_-1003635708322	Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 100\nBalance:640.99 SAR\n27/1/26 22:47AlRajhiBank	2026-01-27 22:47:17.048604	PARSED	\N
94a0e1f0-2ed1-460e-99d6-d5e9ee5f4aa1	Telegram-Channel_-1003635708322	Online Purchase\nCard:7868 ;Visa\nAmount:539.99 SAR\nAt: GOOGLE*GO\nCountry:USA\nBalance:88.58 SAR\n27/1/26 22:47AlRajhiBank	2026-01-27 22:47:41.793063	PARSED	\N
baebd524-309d-4987-82e4-a9f1f55084d4	Telegram-Channel_-1003635708322	Refund\nCard: 7868; 001\nAmount: 15.35 SAR\nFrom: GOOGLE*GO\n 27/1/26 22:54AlRajhiBank	2026-01-27 22:54:15.705864	PARSED	\N
cc3b9a7a-b751-4902-bbd1-1899a0a52a02	Telegram-Channel_-1003635708322	Debit: Loan Instalment\nInstalment: SAR 3032.19\nFrom: 5225\nRemaining Amount: SAR 222872.89\n25/1/26 20:27+966566985112	2026-01-27 23:49:01.182734	PARSED	\N
67242ede-2642-42d2-b94d-f3c75c4ced97	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 3032.19\nTo: 5225\n26/1/25 17:48+966566985112	2026-01-27 23:53:48.908405	PARSED	\N
73018b99-631f-4e1c-a739-9973149c19cb	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:IQFAL ALA\n28/1/26 11:05+966566985112	2026-01-28 12:28:03.990467	PARSED	\N
f37f3b9d-62a6-439d-bd94-fd87daba9840	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:IQFAL ALA\n28/1/26 11:05	2026-01-28 12:39:10.250424	PARSED	\N
4a4882c0-0179-4b79-83a7-2738cb19b7b3	Telegram-Channel_-1003635708322	+966566985112	2026-01-28 12:40:26.368564	FAILED	AI determined not a financial event
c10d6b64-817b-426f-bca4-b40fafa75d79	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 96\nAt:IQFAL ALA\n28/1/26 11:03AlRajhiBank	2026-01-28 11:03:24.328111	PARSED	\N
1acc4a5f-94c5-4d2a-9331-c51385b00380	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 96\nAt:IQFAL ALA\n28/1/26 11:03+966566985112	2026-01-28 12:23:45.579034	PARSED	\N
5fdc9b1f-a969-452a-81ab-fc11158068f8	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:IQFAL ALA\n28/1/26 11:05+966566985112	2026-01-28 12:26:10.967988	PARSED	\N
5edf89bd-d621-40c8-ae30-447e0d3f4aa3	Telegram-Channel_-1003635708322	+966566985112 ---	2026-01-28 12:44:10.346148	FAILED	AI determined not a financial event
48c96d0d-882f-4d2f-b672-f84a9fdde7fd	Telegram-Channel_-1003635708322	+966566985112	2026-01-28 12:44:53.068718	FAILED	AI determined not a financial event
7d1485cb-44f4-43d3-9a12-8ac2fd85ae31	Telegram-Channel_-1003635708322	+966566985112 --- PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:IQFAL ALA\n28/1/26 11:05	2026-01-28 12:48:00.91381	PARSED	\N
19e9f6c5-724e-4c2f-a673-ab55dd58a7c0	Telegram-Channel_-1003635708322	+966566985112\n---\nPoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	2026-01-28 12:52:09.578676	PARSED	\N
fb3bae7c-a439-4124-809f-22affdeca400	Telegram-Channel_-1003635708322	---	2026-01-28 12:54:02.644811	FAILED	AI determined not a financial event
a0bafdb9-27a0-4345-b185-4a3d278cebbc	+966566985112	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	2026-01-28 12:55:09.195779	PARSED	\N
cf2cc1b1-a553-4503-b460-6dabd90d18f8	+966566985112	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	2026-01-28 12:56:21.513504	PARSED	\N
8a2da747-dd6b-44a4-8c43-52e315bd1134	Unknown		2026-01-28 13:00:34.14029	FAILED	AI determined not a financial event
0a644eee-a0b7-4bbd-a7a8-cd987b03115a	Unknown		2026-01-28 13:00:53.406277	FAILED	AI determined not a financial event
139f68fd-f712-4c22-925f-a66afa309545	Unknown		2026-01-28 13:01:05.074116	FAILED	AI determined not a financial event
9ec9b87f-d27c-41b8-96e1-82656953a7ec	Unknown		2026-01-28 13:01:06.724701	FAILED	AI determined not a financial event
36be9560-fddd-407c-82d3-1a0715120268	Unknown		2026-01-28 13:06:28.154695	FAILED	AI determined not a financial event
1f8bc642-8360-4643-bca6-a8e454985233	Unknown		2026-01-28 13:06:30.285708	FAILED	AI determined not a financial event
fed85220-5a55-4756-8ed4-a0548b85caed	PoS	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	2026-01-28 13:17:19.201241	PARSED	\N
645393ef-de38-4b4c-9cf7-577dc9c85fe4	PoS	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	2026-01-28 13:17:43.713599	PARSED	\N
dbc7662d-a516-47f2-bf0a-616fd24c4dbb	Unknown	+966566985112 —- PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	2026-01-28 13:53:19.502785	PARSED	\N
4f49b505-7985-4b79-a8a1-61cfcb0d5e33	Unknown	+966566985112 —— PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	2026-01-28 13:58:56.957176	PARSED	\N
6d1cb6b6-1c39-4615-9ee2-9cabe913a6a8	Unknown	Start	2026-01-28 14:03:44.159127	FAILED	AI determined not a financial event
28025054-620c-472d-b633-e46bf073f749	AlRajhiBank	Online Purchase\nBy:4390;mada-Apple Pay\nFrom:2104\nAmount:SAR 52.45\nAt:Keemart\n28/1/26 14:28AlRajhiBank	2026-01-28 14:28:33.160078	PARSED	\N
deffacb1-adf9-42e3-ae5e-61090b00d1fe	Unknown	⏳ Processing...	2026-01-28 14:33:13.541205	FAILED	AI determined not a financial event
624ce67b-fb1a-4235-b74b-35fca533efdb	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 7.0 SAR\nMerchant: GOT COOKI\nBalance: 84420.13 SAR	2026-01-28 14:33:16.951183	PARSED	\N
a1202e90-6fe9-4c98-b8a0-18b18fd43e88	Unknown	⏳ Processing...	2026-01-28 14:33:20.486065	FAILED	AI determined not a financial event
69afc214-3003-4fd1-ae1e-9fa309072ad1	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 16.0 SAR\nMerchant: CITY FRES\nBalance: 84404.13 SAR	2026-01-28 14:33:22.683073	PARSED	\N
b3178a97-0f37-4cba-a37a-21a0147a8a50	Unknown	⏳ Processing...	2026-01-28 14:33:27.976979	FAILED	AI determined not a financial event
354a7867-f50f-48db-9bb1-0eecf8fd5b30	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 50.0 SAR\nMerchant: HABIBAH S\nBalance: 84354.13 SAR	2026-01-28 14:33:31.146885	PARSED	\N
086b27e9-f235-4163-89ff-13bf897c3d7d	Unknown	⏳ Processing...	2026-01-28 14:33:33.599212	FAILED	AI determined not a financial event
ec14fceb-e3a9-493c-a40f-d619fc3576a2	Unknown	✅ **Success!**\nAccount: Grocery\nAmount: 36.0 SAR\nMerchant: HABIBAH S\nBalance: 432.84 SAR	2026-01-28 14:33:35.676032	PARSED	\N
7ba7aebf-1a22-48be-b783-41501169c9a6	Unknown	⏳ Processing...	2026-01-28 14:33:41.034774	FAILED	AI determined not a financial event
b2d5c5e5-9d08-442f-ae6f-53d79676c6ed	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 47.65 SAR\nMerchant: Alsawadi R\nBalance: 84306.48 SAR	2026-01-28 14:33:43.037872	PARSED	\N
0d2aca29-66e0-4130-84c5-0b70b300c508	Unknown	⏳ Processing...	2026-01-28 14:33:46.342731	FAILED	AI determined not a financial event
75a35955-f783-4c2f-8242-6673a2dc64c3	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 539.99 SAR\nMerchant: Credit Card Payment\nBalance: -539.99 SAR	2026-01-28 14:33:48.331454	PENDING	\N
883aae1b-c014-4741-9be1-fec271f7dd95	Unknown	⏳ Processing...	2026-01-28 14:33:51.160221	FAILED	AI determined not a financial event
5197a702-9838-41d6-8a5d-25ce66121b98	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 539.99 SAR\nMerchant: Declined due to insufficient fund. Online Purchase at Google On\nBalance: 0.00 SAR	2026-01-28 14:33:53.055176	PARSED	Transaction Declined (Not added to ledger)
cdff2532-5576-4289-b8f5-ac817dc37b56	Unknown	⏳ Processing...	2026-01-28 14:33:55.380424	FAILED	AI determined not a financial event
e13b4d79-cd48-4700-b5cb-dfdd3d3f023f	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 1.0 SAR\nMerchant: Credit Card Payment\nBalance: -1.00 SAR	2026-01-28 14:33:57.272965	PENDING	\N
a9f028b0-0886-475a-aef1-31848ffdbddf	Unknown	⏳ Processing...	2026-01-28 14:33:59.514092	FAILED	AI determined not a financial event
8efd9389-0267-434a-a5e3-4c3b4815abae	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 539.99 SAR\nMerchant: Online Purchase declined at GOOGLE*GO\nBalance: 538.99 SAR	2026-01-28 14:34:01.494564	PARSED	Transaction Declined (Not added to ledger)
e13fa7a9-6f98-43d1-a0a5-b127b9b1fae9	Unknown	⏳ Processing...	2026-01-28 14:34:03.793629	FAILED	AI determined not a financial event
6c305766-8bd7-496c-8892-c601d0c25856	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 539.99 SAR\nMerchant: Online Purchase declined at Google On\nBalance: 1078.98 SAR	2026-01-28 14:34:13.718155	PARSED	Transaction Declined (Not added to ledger)
a4d80254-ce0d-4ec6-903d-20fa9fa0bb98	Unknown	⏳ Processing...	2026-01-28 14:34:16.193544	FAILED	AI determined not a financial event
f1c60ee5-9300-478c-a715-13328d449108	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 100.0 SAR\nMerchant: Credit Card Payment\nBalance: 978.98 SAR	2026-01-28 14:34:21.309296	FAILED	Unknown Account/Card
1470ec8e-e48e-42c0-bc45-b16f7f861bf2	Unknown	⏳ Processing...	2026-01-28 14:34:23.657796	FAILED	AI determined not a financial event
e06f742e-4045-4887-8c14-05b0777b4ef3	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 539.99 SAR\nMerchant: GOOGLE*GO\nBalance: 1518.97 SAR	2026-01-28 14:34:25.525457	FAILED	Unknown Account/Card
a16ae05f-5dcf-4183-845c-45eb96649b5d	Unknown	⏳ Processing...	2026-01-28 14:34:28.003283	FAILED	AI determined not a financial event
2d4ee8c3-04d6-4967-a0b6-88d4c6a9c56a	Unknown	✅ **Success!**\nCredit Card: Travel Plus\nAmount: 15.35 SAR\nMerchant: Incoming Transfer\nBalance: 1503.62 SAR	2026-01-28 14:34:30.234737	FAILED	Unknown Account/Card
73cd6594-8248-4304-b1fb-100211f7ce27	Unknown	⏳ Processing...	2026-01-28 14:34:35.692781	FAILED	AI determined not a financial event
167f561a-6de6-4a3c-a070-4c33bb4ebc16	Unknown	✅ **Success!**\nAccount: Auto Lease\nAmount: 3032.19 SAR\nMerchant: Loan Instalment\nBalance: -3032.19 SAR	2026-01-28 14:34:37.745725	PARSED	\N
1e49a85d-ea3f-4e1d-a138-c8dfd48ec530	Unknown	⏳ Processing...	2026-01-28 14:34:40.48984	FAILED	AI determined not a financial event
5bb962b3-b374-472b-b646-0f05d83aaf30	Unknown	❓ **Unknown Source Account**\nCredit of 3032.19 SAR logged to Auto Lease as PENDING.\n\n➡️ Open the app and select the **Source Account** to complete this transfer.	2026-01-28 14:34:42.424653	PARSED	\N
8eede966-a6fd-4ae7-bd98-36d804b854a1	Unknown	⏳ Processing...	2026-01-28 14:34:44.422431	FAILED	AI determined not a financial event
bb193a4d-ae22-429b-8aab-ef15136ab440	Unknown	❌ AI Error: 404 models/gemini-2.0-flash-exp is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.	2026-01-28 14:34:46.620254	FAILED	AI determined not a financial event
fad9883c-2295-4e46-bdd8-7dbe3c9e582b	Unknown	⏳ Processing...	2026-01-28 14:34:49.14516	FAILED	AI determined not a financial event
b2147579-9972-4232-8e17-afab4fdc3ee2	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 96 SAR\nMerchant: IQFAL ALA\nBalance: 84114.48 SAR	2026-01-28 14:34:51.011996	PARSED	\N
d50183df-9a3a-4964-9e58-a34e41136762	Unknown	⏳ Processing...	2026-01-28 14:34:53.210128	FAILED	AI determined not a financial event
3ef1002e-795b-4b81-a002-73807f7a9355	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 84024.48 SAR	2026-01-28 14:34:55.22654	PARSED	\N
20acbf29-e4b5-476e-82b8-e37df7530f59	Unknown	⏳ Processing...	2026-01-28 14:34:57.73846	FAILED	AI determined not a financial event
0d54d27b-aac3-49eb-b183-8f1dad43c250	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 83934.48 SAR	2026-01-28 14:34:59.783779	PARSED	\N
ee7b8d94-92e0-4c89-8de2-abbc1c87c1d2	Unknown	⏳ Processing...	2026-01-28 14:35:02.150675	FAILED	AI determined not a financial event
e96eb618-9791-49e5-ab6a-efa1f277d0a0	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 83844.48 SAR	2026-01-28 14:35:04.055554	PARSED	\N
bacf4bb0-e263-4eba-aa0b-72434c0f6674	Unknown	⏳ Processing...	2026-01-28 14:35:14.327729	FAILED	AI determined not a financial event
80bcada6-be17-4a65-ae98-40af8b99aef4	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:35:16.495121	FAILED	AI determined not a financial event
3eed9ea4-3db2-4037-bebb-f11085bdac69	Unknown	⏳ Processing...	2026-01-28 14:35:21.497865	FAILED	AI determined not a financial event
4bb07ab9-9774-4cb0-9888-2d1d941a1205	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:35:23.647262	FAILED	AI determined not a financial event
1e8d1dc5-9d44-4fd8-8c7f-21cea467fb81	Unknown	⏳ Processing...	2026-01-28 14:35:25.825459	FAILED	AI determined not a financial event
fc62df8a-ac22-4f80-b4a6-a3a30bcf81f5	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:35:27.848549	FAILED	AI determined not a financial event
0cfe711e-aae3-4725-8e5d-546044a77cbc	Unknown	⏳ Processing...	2026-01-28 14:35:30.096296	FAILED	AI determined not a financial event
5009d68d-036d-4499-bdc4-86f9aaffb528	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 83754.48 SAR	2026-01-28 14:35:35.159734	PARSED	\N
9034a51e-1bc8-417b-b3b0-eeaad3d9e169	Unknown	⏳ Processing...	2026-01-28 14:35:37.604791	FAILED	AI determined not a financial event
3256e4c1-b65c-4b07-91c0-189caa9070fb	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83664.48 SAR	2026-01-28 14:35:39.812908	PARSED	\N
31aed667-5a89-43c5-a125-85bc0df09dbc	Unknown	⏳ Processing...	2026-01-28 14:35:42.648556	FAILED	AI determined not a financial event
22e0eb84-4008-44e0-9205-5e768a2a8957	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:35:44.635196	FAILED	AI determined not a financial event
d9cb5710-33cd-4b75-bf0d-337144ea09e9	Unknown	⏳ Processing...	2026-01-28 14:35:46.981864	FAILED	AI determined not a financial event
112d8f3c-50b2-46fa-9300-2b4408ac9215	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83574.48 SAR	2026-01-28 14:35:48.927647	PARSED	\N
c6da553b-dcb6-422f-b2eb-ec6dc3af4768	Unknown	⏳ Processing...	2026-01-28 14:35:51.175567	FAILED	AI determined not a financial event
b48d9a5d-52c7-4fc0-b790-aeae0ce62ca6	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83484.48 SAR	2026-01-28 14:35:53.15751	PARSED	\N
3cb9a1ba-fc9c-4fbf-95e2-e8b8577b27b4	Unknown	⏳ Processing...	2026-01-28 14:35:55.512947	FAILED	AI determined not a financial event
49a99c7e-f06a-42c7-9d3f-1a3a593c91f1	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:35:57.742255	FAILED	AI determined not a financial event
a630ca52-f67b-4eaf-86bc-5154f8091f9b	Unknown	⏳ Processing...	2026-01-28 14:35:59.70179	FAILED	AI determined not a financial event
4336a632-6226-4a34-9421-ad4629a75f1e	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:36:01.625572	FAILED	AI determined not a financial event
c429ff97-f063-4378-9f44-2fd91e4ddf16	Unknown	⏳ Processing...	2026-01-28 14:36:03.560601	FAILED	AI determined not a financial event
b69b2135-4df1-43a3-adb0-a3505036b681	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:36:15.590072	FAILED	AI determined not a financial event
81fc5734-305b-4b85-a909-13867190d404	Unknown	⏳ Processing...	2026-01-28 14:36:18.010972	FAILED	AI determined not a financial event
8334b953-75de-44d2-b37f-139c689260d8	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:36:19.901714	FAILED	AI determined not a financial event
0b7567ee-35b2-422f-9836-a6bc426b739b	Unknown	⏳ Processing...	2026-01-28 14:36:21.976373	FAILED	AI determined not a financial event
1ce1633f-1126-4137-8574-dba05ad66974	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:36:26.932664	FAILED	AI determined not a financial event
eabe5da4-ceaf-467b-9d9c-700a80c0fcb8	Unknown	⏳ Processing...	2026-01-28 14:36:28.904763	FAILED	AI determined not a financial event
e9ebc92e-6ecf-49c8-a117-9f4ce7ddeddc	Unknown	ℹ️ Not a financial event. Ignored.	2026-01-28 14:36:30.967533	FAILED	AI determined not a financial event
bd4cd566-20d1-4c85-84c3-3fb72e605ebc	Unknown	⏳ Processing...	2026-01-28 14:36:33.060512	FAILED	AI determined not a financial event
f57e95f6-7a7a-41f8-84a3-4a59a5a55b54	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90.0 SAR\nMerchant: Test\nBalance: 83394.48 SAR	2026-01-28 14:36:35.084762	PARSED	\N
4fa0348d-422e-4d1e-b86d-70037c3eaaf3	Unknown	⏳ Processing...	2026-01-28 14:36:40.342841	FAILED	AI determined not a financial event
b666dd1a-2a42-4014-aaef-ea2324181171	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83304.48 SAR	2026-01-28 14:36:42.293611	PARSED	\N
d85157db-86b6-4b95-b3a8-25736fd415d9	Unknown	⏳ Processing...	2026-01-28 14:36:44.593934	FAILED	AI determined not a financial event
a1313cb3-d2e2-4e01-b228-8340ca633c40	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83214.48 SAR	2026-01-28 14:36:47.061595	PARSED	\N
87ab0334-8abb-409a-b468-b7e1085b8ae8	Unknown	⏳ Processing...	2026-01-28 14:36:49.345384	FAILED	AI determined not a financial event
efb91329-ecec-4999-ba7b-600963e2af60	Unknown	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83124.48 SAR	2026-01-28 14:36:51.282947	PARSED	\N
81af9078-475a-4063-9feb-4b10ad454762	Unknown	⏳ Processing...	2026-01-28 14:36:54.392827	FAILED	AI determined not a financial event
c3de319c-e834-4872-80c3-f6b3c5cc5e65	Unknown	✅ **Success!**\nAccount: Grocery\nAmount: 52.45 SAR\nMerchant: Keemart\nBalance: 380.39 SAR	2026-01-28 14:36:56.472614	PARSED	\N
70b18115-4356-4a10-bd2b-541305320448	Unknown	⏳ Processing...	2026-01-28 14:36:58.539677	FAILED	AI determined not a financial event
cdb05558-347d-4099-8cc3-52c4aedf8af0	Unknown	✅ **Success!**\nAccount: Grocery\nAmount: 52.45 SAR\nMerchant: Keemart\nBalance: 327.94 SAR	2026-01-28 14:37:00.431794	PARSED	\N
0072a127-e5fe-4b3c-8efb-22a5ec262c7b	Unknown	@userinfobot	2026-01-28 14:54:25.918858	FAILED	AI determined not a financial event
93a40cd1-fc63-420a-accd-8d9277c2bf99	Unknown	+966566985112 —— PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 900\nAt:Test\n28/1/26 11:05	2026-01-28 15:58:35.776678	PARSED	\N
64abae2e-a291-4170-abcd-cc668c13a697	Unknown	+966566985112 —— PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 900\nAt:Test\n28/1/26 11:05	2026-01-28 16:01:07.485783	PARSED	\N
05a11d5d-e209-4abd-8f93-8b58d0392dea	Unknown	AlRajhiBank —— PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 119.27\nAt:BERAIN CO\n28/1/26 17:46	2026-01-28 17:45:45.315557	PARSED	\N
0b6d398b-9301-4f60-a349-2e97fe297e09	Unknown	AlRajhiBank —— Credit Card:Payment\nCard:Visa 7868\nAmount:USD 50\nBalance:51 USD\n28/1/26 18:51	2026-01-28 18:51:25.557448	PARSED	\N
6775139f-0bfc-4315-bc1f-64676ae2cc89	Unknown	AlRajhiBank —— Online Purchase\nCard:7868 ;Visa\nAmount:49.99 USD\nAt: PADDLE.NE\nCountry:UK\nBalance:1.01 USD\n28/1/26 18:52	2026-01-28 18:51:57.243317	PARSED	\N
2aacb052-4e61-4aae-8e99-3351b9d1453e	+966566985112	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 2,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-13 13:36\nRef: 2BTMS11336096857	2026-01-28 22:07:29.565124	PARSED	\N
913e4100-bbec-4a00-9804-91f250e25669	+966566985112	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 2000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26-1-13 13:36	2026-01-28 22:08:24.595377	PARSED	\N
203fd82d-0499-4fc0-bdee-09038fc5158e	AlRajhiBank	Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 649\nBalance:737.58 SAR\n28/1/26 22:24	2026-01-28 22:24:03.797953	PARSED	\N
e44c5ead-dfa8-4ae5-a79f-727b208ac925	AlRajhiBank	Online Purchase\nBy:7868 ;Visa\nAmount:731.31 SAR\nAt:Amazon SA\nBalance:6.27 SAR\n28/1/26 22:24	2026-01-28 22:24:15.581272	PARSED	\N
a14928c8-6667-4b2a-a7a7-633b756f5451	+966566985112	Transfer Between Your Accounts\nAmount: SAR 100\nTo: 1505\n26-1-14 22:41	2026-01-28 22:25:36.430588	PARSED	\N
6b3c6219-e22a-451e-9c71-e5664b55275c	+966566985112	Transfer Between Your Accounts\nAmount: SAR 100\nTo: 1505\n26-1-14 22:41	2026-01-28 22:34:29.348195	PARSED	\N
8657a40a-6da6-4de0-aeb2-2b11f7b7724b	+966566985112	Transfer Between Your Accounts\nAmount: SAR 200\nTo: 7772\n26-1-14 22:42	2026-01-28 22:35:02.957415	PARSED	\N
96e696bb-73bf-4d72-97af-823eb0bc098c	+966566985112	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 2,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-13 13:36\nRef: 2BTMS11336096857	2026-01-28 22:40:46.736978	PARSED	\N
9934e69e-af46-4988-9faa-73fdda59451b	+966566985112	Transfer Between Your Accounts\nAmount: SAR 200\nTo: 7772\n26-1-14 22:42	2026-01-28 22:43:50.405793	PARSED	\N
c2e2d185-b643-423c-af49-e8d7d68f3f88	+966566985112	Transfer Between Your Accounts\nAmount: SAR 200\nTo: 7772\n26-1-14 22:42	2026-01-28 22:46:24.013405	PARSED	\N
40f88e83-97a8-4bb3-8bcf-1655cd4ec2f8	+966566985112	Transfer Between Your Accounts\nAmount: SAR 200\nTo: 7772\n26-1-14 22:42	2026-01-28 22:47:20.944222	PARSED	\N
5490314e-1a16-490a-a5b7-9fdc77cb8bc5	+966566985112	Transfer Between Your Accounts\nAmount: SAR 200\nTo: 7772\n26-1-14 22:42	2026-01-28 22:52:09.366135	PARSED	\N
ccdf9b05-5400-4eeb-b7ff-7a1ecf8e8ffa	+966566985112	Transfer Between Your Accounts\nAmount: SAR 300\nTo: 7772\n26-1-14 22:42	2026-01-28 22:56:38.693866	PARSED	\N
38c736d5-f183-4cad-9be5-0806b5addced	+966566985112	Transfer Between Your Accounts\nAmount: SAR 300\nTo: 7772\n26-1-14 22:42	2026-01-28 22:58:54.584042	PARSED	\N
6c4ecb7b-7aad-425d-a003-ee690f254ae1	+966566985112	Transfer Between Your Accounts\nAmount: SAR 300\nTo: 7772\n26-1-14 22:42	2026-01-28 23:02:53.567789	PARSED	\N
5377d59d-c373-4aae-9a8e-81b1c3921a12	+966566985112	Transfer Between Your Accounts\nAmount: SAR 300\nTo: 7772\n26-1-14 22:42	2026-01-28 23:03:04.124261	PARSED	\N
47e22374-639f-4b70-bc1f-963b0da5c0d4	+966566985112	Transfer Between Your Accounts\nAmount: SAR 300\nTo: 7772\n26-1-14 22:42	2026-01-28 23:03:49.274371	PARSED	\N
e641a5a3-586e-456b-a8b4-ebb4f1de57c5	+966566985112	Transfer Between Your Accounts\nAmount: SAR 300\nTo: 7772\n26-1-14 22:42	2026-01-28 23:04:30.501342	PARSED	\N
\.


--
-- Data for Name: savings_goals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.savings_goals (id, name, target_amount, current_amount, target_date, icon, color) FROM stdin;
\.


--
-- Data for Name: training_examples; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.training_examples (id, raw_text, parsed_json, created_at) FROM stdin;
d480e172-eadf-4cbc-9b01-8411b8b87d7b	Transfer Between Your Accounts\nAmount: SAR 31.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 31.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:22:09.37947
2c329c92-3943-4fd7-ace7-75526ee324b2	Transfer Between Your Accounts\nAmount: SAR 31.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 31.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:24:36.526969
e8d9210f-0236-48f4-809e-b4c3be23636f	Transfer Between Your Accounts\nAmount: SAR 11.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 11.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:45:53.85856
a5b24645-20d5-4850-a8ff-d5cdc47cbf73	Transfer Between Your Accounts\nAmount: SAR 112.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 112.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:46:26.299198
42e266b0-a67b-4b2f-b0ff-fa5bb31b8d70	Transfer Between Your Accounts\nAmount: SAR 122.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 122.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:47:17.38358
53ccb8e2-a693-4108-a457-eef330b55297	Transfer Between Your Accounts\nAmount: SAR 152.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 152.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:50:58.477747
bab7e4d1-6551-4b72-a8de-c091275dff1d	Transfer Between Your Accounts\nAmount: SAR 11.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 11.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:53:45.686604
396cb612-f0f5-4f69-bd39-b5a21764ca93	Transfer Between Your Accounts\nAmount: SAR 21.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 21.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:54:41.609865
809efc53-4414-4f21-bd51-46719ea78ef0	Transfer Between Your Accounts\nAmount: SAR 162.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 162.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:58:45.077534
2c55a7e2-d9bf-454a-b409-9c3b73aeecd2	Transfer Between Your Accounts\nAmount: SAR 162.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 162.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 22:05:26.812461
019ec11f-808b-47a5-9383-3309d14d13d2	Transfer Between Your Accounts\nAmount: SAR 102.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 102.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 22:07:11.569233
095b0f22-629a-42a6-a149-179398a32884	Transfer Between Your Accounts\nAmount: SAR 112.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 112.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 02:06:41.811937
656b0c4c-fd7b-48a4-a2a3-3dad2f70eab7	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 7\nAt:GOT COOKI\n19/1/26 13:33	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "GOT COOKI", "brand_name": "GOT COOKI", "amount": 7.0, "currency": "SAR", "date": "2026-01-19", "time": "13:33", "category": "Food", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 02:48:46.929222
040504a7-f560-4278-8d52-19db22b7bf2b	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 97\nAt:Five Guys\n12/1/26 13:47	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Five Guys", "brand_name": "Five Guys", "amount": 97.0, "currency": "SAR", "date": "2026-01-12", "time": "13:47", "category": "Food", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 02:50:54.077535
ff277145-96b8-4ec3-babb-10b028ac9489	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 95\nAt:Five Guys\n12/1/26 13:47	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Five Guys", "brand_name": "Five Guys", "amount": 95.0, "currency": "SAR", "date": "2026-01-12", "time": "13:47", "category": "Food", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-22 02:53:22.5861
1611aa62-d50a-4ae9-b6db-71f0105d21cc	OTP Code:3894\nReason:Local Transfer - Mobile App\nAmount:350.00 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "Local Transfer - Mobile App", "brand_name": null, "amount": 350.0, "currency": "SAR", "date": "2026-01-22", "time": null, "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 03:42:32.401445
d47ef412-57e0-4e72-8f91-7c7743db0bc9	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-22 03:49:03.628553
01540c06-8192-4179-9c54-2a2255f86dda	Transfer Between Your Accounts\nAmount: SAR 0.04\nTo: 1505\n26/1/22 13:46	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 0.04, "currency": "SAR", "date": "2026-01-22", "time": "13:46", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 13:46:43.541264
4ce856d4-9981-442a-92a7-52ac54921476	Online Purchase\nCard:7868 ;Visa\nAmount:31.29 USD\nAt: ADOBE *8\nCountry:USA\nBalance:3.73 USD\nDate:06-01-2026 14:59	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "ADOBE *8", "brand_name": "Adobe", "amount": 31.29, "currency": "USD", "date": "2026-01-06", "time": "14:59", "category": "Other", "source_account_last4": "7868", "destination_account_last4": null, "status": "success"}	2026-01-22 14:02:09.521705
3aaa9902-7b89-43dd-b874-c5422cc3b865	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-22 18:51 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "purchase", "merchant": "Amazon.sa", "brand_name": "Amazon", "amount": 1.0, "currency": "SAR", "date": "2026-01-22", "time": "18:51", "category": "Other", "source_account_last4": "1645", "destination_account_last4": null, "status": "success"}	2026-01-22 18:51:54.946829
02a6aa7e-3aff-41af-bdc1-42f14363a692	One Time Password\nCode: 5565\nReason: To Transfer Via Instant Payment Service\nBeneficiary: MYACCRAJHI\nAmount: 1000.00 SAR\nDate: 2026-01-22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MYACCRAJHI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 20:34:15.07116
4544dff9-e284-4aa5-a8be-f6e2591e8738	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-22 20:34:37.485489
ef6c65c7-311d-4b2a-92ca-c56d8bc37a7d	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-22 20:34:47.795012
ffd39c27-28b0-4769-9528-da3edfc45d0a	OTP Code:6238\nReason:Rajhi Transfer - Mobile App\nAmount:540.00 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "Rajhi Transfer - Mobile App", "brand_name": null, "amount": 540.0, "currency": "SAR", "date": "2026-01-22", "time": null, "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 20:43:23.799753
29679035-e346-4e13-8833-be16b159eb11	Debit Internal Transfer\nFrom:7772\nAmount:SAR 540\nTo:MOHAMMED ISLAM\nTo:0477\n26/1/22 20:43	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "MOHAMMED ISLAM", "brand_name": null, "amount": 540.0, "currency": "SAR", "date": "2026-01-26", "time": "20:43", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "0477", "status": "success"}	2026-01-22 20:43:33.522208
19f8a8e0-2225-4cc8-bf51-bf2823d1edc5	OTP Code:9957\nReason:Rajhi Transfer - Mobile App\nAmount:250.00 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "Rajhi Transfer - Mobile App", "brand_name": null, "amount": 250.0, "currency": "SAR", "date": "2026-01-22", "time": null, "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 21:03:10.407083
8ce57f16-0f19-4624-bbb8-d31022f05aa7	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "SARAH ALALMAEE", "brand_name": null, "amount": 250.0, "currency": "SAR", "date": "2026-01-26", "time": "21:03", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "2104", "status": "success"}	2026-01-22 21:03:22.817566
5088cebc-991f-4e08-8370-0222223cdb2e	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Back comfort trading comp \nof: 1263.80 SAR \non : 2026-01-22 22:06 \nAvailable Balance: 21839.24 SAR \nDue Amount: 51896.96 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Back comfort trading comp", "brand_name": "Back comfort trading comp", "amount": 1263.8, "currency": "SAR", "date": "2026-01-22", "time": "22:06", "category": "Other", "source_account_last4": "4897", "destination_account_last4": null, "status": "success"}	2026-01-22 22:06:52.301479
57829577-abc6-4006-8d66-ad9302960d02	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :URTH CAFFE KAFD \nof: 86.00 SAR \non : 2026-01-22 22:46 \nAvailable Balance: 21753.24 SAR \nDue Amount: 51896.96 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "URTH CAFFE KAFD", "brand_name": "URTH CAFFE", "amount": 86.0, "currency": "SAR", "date": "2026-01-22", "time": "22:46", "category": "Food", "source_account_last4": "4897", "destination_account_last4": null, "status": "success"}	2026-01-22 22:46:23.911489
e458964b-a1d8-4585-bf6e-684271fb0d6b	Online Purchase Apple Pay Credit Card: 4897 at :q-Rowleys of : 683.90 SAR on : 2026-01-23 00:37 Available Balance is: 21069.34 SAR Due Amount: 51896.96 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "q-Rowleys", "brand_name": "q-Rowleys", "amount": 683.9, "currency": "SAR", "date": "2026-01-23", "time": "00:37", "category": "Other", "source_account_last4": "4897", "destination_account_last4": null, "status": "success"}	2026-01-23 00:37:55.89533
ac81cd93-e0fe-494f-80cc-3c431a572fef	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "SARAH ALALMAEE", "brand_name": null, "amount": 250.0, "currency": "SAR", "date": "2026-01-26", "time": "21:03", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "2104", "status": "success"}	2026-01-23 12:41:21.701792
963248c1-5825-435f-bfc7-7f99b180641a	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "SARAH ALALMAEE", "brand_name": null, "amount": 250.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-26", "time": "21:03", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "2104", "status": "success"}	2026-01-23 13:17:04.309006
44dccdc4-f541-4c29-bfa1-61e2cb747524	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:17:34.368135
28067511-1602-4a83-bb86-507593ba45ce	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:22:54.573199
cb2df096-2ef6-4549-b150-5ac5181f7622	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:31:56.506935
c89bc831-c3da-4c8a-881e-33edee139c2d	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:33:56.292324
03784f2f-7756-4ea6-ba4c-83d4f6fc4ea5	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:40:47.605843
7d71f277-7224-4d46-88ff-d77968482db9	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:42:20.67451
5da18c38-d079-4c7d-95e4-5f3983d82ba6	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:49:18.279632
34479090-cfe1-476c-b7cb-e83da2a0f945	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:50:44.587012
3bacb0ef-5b5d-4305-abcb-51128adb52d4	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:55:05.50509
1ab8a718-25cd-44ad-91f0-a38eb354be0a	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:59:04.077301
c2e14503-7b9f-4edc-84c7-8698c84ce708	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:00:02.666466
71d1a451-aa6a-475d-b4c9-1499f8893f33	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:01:39.296639
cdea10ed-553f-4222-a037-02f3afbd6143	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:02:19.920027
f3636f62-a34a-40b4-9e1b-9164a4354350	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:10:14.589965
40ec3d27-7905-4472-b9f5-e32066deb446	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:10:57.853947
e17f9616-2a4b-43a2-9f25-d01b7a34f423	Disliked “Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021”	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:14:35.826442
e6e05ef1-0c9f-4179-bdff-b5247978a42d	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:14:56.75677
9779e0f5-e80c-4821-a2c9-6ca5d04e0d4e	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 52\nAt:FUTURE ID\n23/1/26 17:51	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "FUTURE ID", "brand_name": "FUTURE ID", "amount": 52.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-23", "time": "17:51", "category": "Unknown", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-23 17:51:45.454666
e9f6f1f0-a10d-4640-bf46-5180b8ffd22e	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 8\nAt:FUTURE ID\n23/1/26 17:55	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "FUTURE ID", "brand_name": "FUTURE ID", "amount": 8.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-23", "time": "17:55", "category": "Unknown", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-23 17:55:38.557795
60365fb2-410b-45b4-b3f9-e886be7bc449	Credit Transfer Internal\nAmount:SAR 500\nTo:7772\nFrom:ABDULRHMAN ALASIRI\nFrom:1998\n26/1/23 19:19	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "ABDULRHMAN ALASIRI", "brand_name": null, "amount": 500.0, "currency": "SAR", "fees": 0.0, "date": "2023-01-26", "time": "19:19", "category": "Transfer", "source_account_last4": "1998", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:20:02.603572
90f2ab50-50cb-4d44-96a5-904c7e8538a1	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:23:41.856246
a2ebc120-fbda-474e-8e6a-bb2d30490599	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:24:28.593873
68ef724b-dc71-4fad-aaa5-cb15d2e465f9	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:48:41.29742
31ebb415-e83c-4ae2-8aec-4cd8b2aa1a05	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 44\nAt:Sasco Pal\n24/1/26 20:38	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Sasco Pal", "brand_name": "Sasco Pal", "amount": 44.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-24", "time": "20:38", "category": "Unknown", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-23 20:38:29.921149
6c3253f3-d229-4bf9-bf47-8c79f04f3683	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1000.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-22 20:34", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:18:10.31535
e8762463-f09e-48de-b97b-727671d7497f	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1000.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-22 20:34", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:18:58.0788
c8cb0235-561b-4aa7-9bb3-46f47b1ed433	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:21\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1200.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 01:21", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:21:41.81897
a76b1285-da7c-4116-b086-2a1d81cd436e	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:29", "available_balance": null, "beneficiary": null, "merchant": "MUATH AMER MOHAMMED ALASIRI", "sender_name": null, "description": "Transfer to Muath"}	2026-01-24 01:39:44.399824
94609472-0629-48d9-93dc-0b2fd717f2ee	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:46\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1200.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 01:46", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:47:16.700022
d5a87712-19f9-4668-85ef-7726af4cc424	Transfer Between Your Accounts\nAmount: SAR 1000\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 1000, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to Expense"}	2026-01-24 01:50:01.144266
533221fd-e736-4d67-a4d8-c686c0f45678	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Internal transfer to Expense (1505)"}	2026-01-24 01:51:47.41106
3ace08e0-77fa-468f-b185-b573944b03be	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Internal Transfer from Expense to 1505"}	2026-01-24 01:58:26.178636
0a017f1b-4e46-4a14-b049-bdd0a90cc674	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to Expense"}	2026-01-24 02:04:07.750202
188228fa-6c13-4bf3-9d58-3f905fc7bff0	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-24 02:13 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "purchase", "source_bank": "Jazira Bank", "destination_bank": null, "source_account_last4": "1645", "destination_account_last4": null, "card_info": null, "amount": 1.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 02:13", "available_balance": 12779.76, "beneficiary": null, "merchant": "Amazon.sa", "sender_name": null, "description": "Internet Purchase Reversal at Amazon.sa"}	2026-01-24 02:13:14.62147
03ae171b-9070-4102-9399-9467fd8435d7	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to Expense"}	2026-01-24 02:19:56.13161
511c52ba-2b6c-4924-8188-2ae24f2a9cd6	Transfer Between Your Accounts\nAmount: SAR 1500\nTo: 1505\n26/1/24 2:19	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1500, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to 1505"}	2026-01-24 02:21:06.808184
c1c04b6b-24f2-4d36-9005-2c226182d5d2	Transfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:27	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:27", "available_balance": null, "beneficiary": null, "merchant": null, "sender_name": null, "description": "Transfer between your accounts"}	2026-01-24 02:27:30.441855
fbe8554c-4e28-4077-b242-da54aec59016	AlRajhiBankTransfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:38	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:38", "available_balance": null, "beneficiary": null, "merchant": null, "sender_name": null, "description": null}	2026-01-24 02:38:48.561339
6fe2adf8-e85e-40a7-9985-e937e3540e68	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "internal_transfer", "source_bank": "Jazira Bank", "destination_bank": "Jazira Bank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 22.0, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": null, "sender_name": null, "description": null}	2026-01-24 03:00:58.886419
a86964a8-d652-4f7b-962e-8a869950dc9a	Sender: AlrajhiBank\nTransfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 22, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Internal transfer to Expense"}	2026-01-24 03:03:46.915978
a27dda17-5b0c-4807-b1b4-4d18a863db5c	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 22, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to 1505"}	2026-01-24 03:09:46.622408
e0a1f967-a6c7-4e10-8bb5-873d6502270b	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Tabby \nof: 614.21 SAR \non : 2026-01-24 05:53 \nAvailable Balance: 20455.13 SAR \nDue Amount: 51896.96 SARJazira Bank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "Jazira Bank", "destination_bank": null, "source_account_last4": "4897", "destination_account_last4": null, "card_info": null, "amount": 614.21, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 05:53", "available_balance": 20455.13, "beneficiary": null, "merchant": "Tabby", "sender_name": null, "description": "POS Purchase at Tabby"}	2026-01-24 05:53:11.898985
4409801c-4bd7-4408-9130-ba767ed807bd	Transfer Between Your Accounts\nAmount: SAR 122\nTo: 1505\n26/1/24 2:19+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 122, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to 1505"}	2026-01-24 10:54:25.832318
2585fef6-86ec-403f-90b8-43ed12d6ad1d	Bill Payment\nFrom:9384\nAmount:SAR 85.01\nBiller:001\nService:STC BILL\nBill:05224907461\nDate:26-1-24 13:24+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "bill_payment", "source_bank": null, "destination_bank": null, "source_account_last4": "9384", "destination_account_last4": null, "card_info": null, "amount": 85.01, "currency": "SAR", "fees": null, "timestamp": "2026-01-26 13:24", "available_balance": null, "beneficiary": null, "merchant": "STC BILL", "sender_name": null, "description": "Bill Payment to STC BILL"}	2026-01-27 09:10:19.105615
8cc2aedc-b6a9-40da-a070-b961f8d9ff2f	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "SNB", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": "7407", "card_info": null, "amount": 350, "currency": "SAR", "fees": 0.29, "timestamp": "2022-01-26 03:48", "available_balance": null, "beneficiary": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "sender_name": null, "description": "Transfer to \\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631"}	2026-01-27 09:42:10.723822
eac06b63-3117-4071-8802-d897880d21e7	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 97\nAt:Five Guys\n12/1/26 13:47+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 97, "currency": "SAR", "fees": null, "timestamp": "2026-01-12 13:47", "available_balance": null, "beneficiary": null, "merchant": "Five Guys", "sender_name": null, "description": "Purchase at Five Guys"}	2026-01-27 09:43:36.91578
86bd0295-0b14-4d4f-99aa-83c40ab105f4	Transfer Between Your Accounts\nAmount: SAR 10000\nTo: 1505\n26/1/25 17:49+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 10000, "currency": "SAR", "fees": null, "timestamp": "2025-01-26 17:49", "available_balance": null, "beneficiary": null, "merchant": null, "sender_name": null, "description": "Transfer to 1505"}	2026-01-27 09:44:19.724577
395232a8-3e52-43d2-ab38-387d99204f56	Online Purchase Apple Pay Credit Card: 4897 at :Tamara of : 2533.34 SAR on : 2026-01-27 10:48 Available Balance is: 16559.80 SAR Due Amount: 55842.86 SARJazira Bank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "Jazira Bank", "destination_bank": null, "source_account_last4": "4897", "destination_account_last4": null, "card_info": "Credit Card: 4897", "amount": 2533.34, "currency": "SAR", "fees": 0, "timestamp": "2026-01-27 10:48", "available_balance": 16559.8, "beneficiary": null, "merchant": "Tamara", "sender_name": null, "description": "Online Purchase at Tamara"}	2026-01-27 10:48:29.446329
271f4963-05f5-4e76-a5d3-cb1ed9e107eb	Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 400\nAt:STC Bank\n27/1/26 11:11AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": "STC Bank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 400.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 11:11", "available_balance": null, "beneficiary": null, "merchant": "STC Bank", "sender_name": null, "description": "Purchase at STC Bank"}	2026-01-27 11:11:03.993197
4d2d1ba5-6948-490d-9bd4-26d64e94b40c	Debit Internal Transfer\nFrom:1505\nAmount:SAR 1500\nTo:MUHAMMAD AKRAM\nTo:1967\n26/1/27 11:15AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": "1964", "card_info": null, "amount": 1500.0, "currency": "SAR", "fees": null, "timestamp": "2027-01-26 11:15", "available_balance": null, "beneficiary": "MUHAMMAD AKRAM", "merchant": "MUHAMMAD AKRAM", "sender_name": null, "description": "Transfer to MUHAMMAD AKRAM"}	2026-01-27 11:15:22.317155
86e465f1-51ea-4600-86fc-e6c523975a2e	PoS\nBy:4390;mada-Atheer\nAmount:SAR 531.16\nAt:BERAIN CO \n27/1/26 11:59AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "4390", "destination_account_last4": null, "card_info": "mada-Atheer 4390", "amount": 531.16, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 11:59", "available_balance": null, "beneficiary": null, "merchant": "BERAIN CO", "sender_name": null, "description": "Purchase at BERAIN CO"}	2026-01-27 11:59:23.238486
02dbb1d1-8353-45f6-b4dd-797de2a4217b	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 7\nAt:GOT COOKI\n27/1/26 12:39AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 7.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 12:39", "available_balance": null, "beneficiary": null, "merchant": "GOT COOKI", "sender_name": null, "description": "Purchase at GOT COOKI"}	2026-01-27 12:39:30.871323
570da4aa-92a3-4c86-b05c-bf4d8afd6be5	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 7\nAt:GOT COOKI\n27/1/26 15:22AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": null, "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 7.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 15:22", "available_balance": null, "beneficiary": null, "merchant": "GOT COOKI", "sender_name": null, "description": "Purchase at GOT COOKI"}	2026-01-27 15:22:19.672443
3b91164a-b40a-44e1-b28c-8a37dc5e1f1d	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 16\nAt:CITY FRES\n27/1/26 15:23AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 16.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 15:23", "available_balance": null, "beneficiary": null, "merchant": "CITY FRES", "sender_name": null, "description": "Purchase at CITY FRES"}	2026-01-27 15:23:08.483211
d9d255f3-be2b-4658-89b6-0ee25f9d83ed	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 50\nAt:HABIBAH S\n28/1/26 20:41AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": null, "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 50.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 20:41", "available_balance": null, "beneficiary": null, "merchant": "HABIBAH S", "sender_name": null, "description": "Purchase at HABIBAH S"}	2026-01-27 20:41:42.814047
7165dbef-c5c2-4b2d-b093-7ff37fd6d518	PoS\nBy:4390;mada-Apple Pay\nAmount:SAR 36\nAt:HABIBAH S\n28/1/26 21:01AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "4390", "destination_account_last4": null, "card_info": "mada-Apple Pay 4390", "amount": 36.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 21:01", "available_balance": null, "beneficiary": null, "merchant": "HABIBAH S", "sender_name": null, "description": "Purchase at HABIBAH S"}	2026-01-27 21:01:25.158459
47038902-7641-450f-af5c-78958c59572b	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 47.65\nAt:Alsawadi R\n28/1/26 21:07AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 47.65, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 21:07", "available_balance": null, "beneficiary": null, "merchant": "Alsawadi R", "sender_name": null, "description": "Purchase at Alsawadi R"}	2026-01-27 21:07:01.744311
5794dfc8-e4f5-44ee-8d2e-fd7271447100	Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 539.99\nBalance:539.99 SAR\n27/1/26 22:45AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "payment", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": null, "destination_account_last4": "7868", "card_info": "Visa 7868", "amount": 539.99, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:45", "available_balance": 539.99, "beneficiary": null, "merchant": null, "sender_name": null, "description": "Credit Card Payment"}	2026-01-27 22:45:01.767479
eff214d0-c04f-4e10-ba05-1c8471f79a22	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 539.99\nMerchant : Google On\nDate : 27/1/26 22:45AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "decline", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "7868", "destination_account_last4": null, "card_info": "7868", "amount": 539.99, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:45", "available_balance": null, "beneficiary": null, "merchant": "Google On", "sender_name": null, "description": "Declined due to insufficient fund. Online Purchase at Google On"}	2026-01-27 22:45:04.403615
a9f068b8-e861-4a52-9376-600f79028ce6	Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 1\nBalance:540.99 SAR\n27/1/26 22:46AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "payment", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": null, "destination_account_last4": "7868", "card_info": "Visa 7868", "amount": 1.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:46", "available_balance": 540.99, "beneficiary": null, "merchant": null, "sender_name": null, "description": "Credit Card Payment"}	2026-01-27 22:45:51.170924
a131fe77-93ba-460c-b8b6-945966d020ee	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 539.99\nMerchant : GOOGLE*GO\nDate : 27/1/26 22:46AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "decline", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "7868", "destination_account_last4": null, "card_info": "7868", "amount": 539.99, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:46", "available_balance": null, "beneficiary": null, "merchant": "GOOGLE*GO", "sender_name": null, "description": "Online Purchase declined at GOOGLE*GO"}	2026-01-27 22:46:11.45335
d1b0896f-2a68-4493-a888-aa83c42f80b5	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 539.99\nMerchant : Google On\nDate : 27/1/26 22:46AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "decline", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "7868", "destination_account_last4": null, "card_info": "7868", "amount": 539.99, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:46", "available_balance": null, "beneficiary": null, "merchant": "Google On", "sender_name": null, "description": "Online Purchase declined at Google On"}	2026-01-27 22:46:13.978663
b716b263-8b46-4424-bd27-4dae35845ed2	Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 100\nBalance:640.99 SAR\n27/1/26 22:47AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "payment", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": null, "destination_account_last4": "7868", "card_info": "Visa 7868", "amount": 100.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:47", "available_balance": 640.99, "beneficiary": null, "merchant": null, "sender_name": null, "description": "Credit Card Payment"}	2026-01-27 22:47:19.30594
9562cee6-8be7-413f-9f8a-a9ef67938c6b	Online Purchase\nCard:7868 ;Visa\nAmount:539.99 SAR\nAt: GOOGLE*GO\nCountry:USA\nBalance:88.58 SAR\n27/1/26 22:47AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "7868", "destination_account_last4": null, "card_info": "Visa 7868", "amount": 539.99, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:47", "available_balance": 88.58, "beneficiary": null, "merchant": "GOOGLE*GO", "sender_name": null, "description": "Purchase at GOOGLE*GO"}	2026-01-27 22:47:43.815964
87191b5b-be4c-412d-92d4-5cbef7fe0de5	Refund\nCard: 7868; 001\nAmount: 15.35 SAR\nFrom: GOOGLE*GO\n 27/1/26 22:54AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "source_bank": null, "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "7868", "card_info": "7868", "amount": 15.35, "currency": "SAR", "fees": null, "timestamp": "2026-01-27 22:54", "available_balance": null, "beneficiary": "GOOGLE*GO", "merchant": "GOOGLE*GO", "sender_name": null, "description": "Refund from GOOGLE*GO"}	2026-01-27 22:54:18.504312
934132d9-d7a0-4e46-8ba5-10beced4cba1	Debit: Loan Instalment\nInstalment: SAR 3032.19\nFrom: 5225\nRemaining Amount: SAR 222872.89\n25/1/26 20:27+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "payment", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "5225", "destination_account_last4": null, "card_info": null, "amount": 3032.19, "currency": "SAR", "fees": null, "timestamp": "2026-01-25 20:27", "available_balance": 222872.89, "beneficiary": null, "merchant": "Loan Instalment", "sender_name": null, "description": "Loan Instalment"}	2026-01-27 23:49:04.011527
0427bb7d-c2b1-4831-839e-a4a8c0341813	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 96\nAt:IQFAL ALA\n28/1/26 11:03AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 96.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:03", "available_balance": null, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 12:23:22.825656
64ea457e-3b28-448c-8979-1d6aa7e01c78	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 96\nAt:IQFAL ALA\n28/1/26 11:03+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 96, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:03", "available_balance": null, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 12:23:47.533384
fd230f77-3b18-498e-a4a1-3af5aa6fe5fd	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:IQFAL ALA\n28/1/26 11:05+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:05", "available_balance": null, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 12:26:12.623493
71a73dd5-4d2a-400d-a096-b03119e04f86	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:IQFAL ALA\n28/1/26 11:05	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:05", "available_balance": null, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 12:39:12.319767
a6b4c2da-cb34-4aa7-9da3-b6e1f0eb7c05	+966566985112 --- PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:IQFAL ALA\n28/1/26 11:05	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_account_last4": "9365", "card_info": "mada-Apple Pay 9365", "amount": 90, "currency": "SAR", "merchant": "IQFAL ALA", "description": "Purchase at IQFAL ALA", "source_bank": null, "destination_bank": null, "fees": null, "timestamp": "2026-01-28 11:05", "available_balance": null, "beneficiary": null, "sender_name": null}	2026-01-28 12:48:02.5643
d143c956-83e2-4b09-85bd-2ffb8b586c6a	+966566985112\n---\nPoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:05", "available_balance": null, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 12:52:12.210985
47f99f53-a624-4de6-8d26-c8cd4755a2b0	PoS\n---\nPoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 90.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:05", "available_balance": null, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 13:17:21.099306
5c545c43-0ba0-4190-a69f-58c956d27b0a	+966566985112 —- PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:05", "available_balance": null, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 13:53:21.862975
0ef5e27f-cb8c-4155-b86b-bdbd627b7842	+966566985112 —— PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 90\nAt:Test\n28/1/26 11:05	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_account_last4": "9365", "card_info": "mada-Apple Pay 9365", "amount": 90, "currency": "SAR", "merchant": "Test", "description": "Purchase at Test"}	2026-01-28 13:58:58.69432
a4ca3109-37cb-463d-a9f1-aa54a4906e5c	Online Purchase\nBy:4390;mada-Apple Pay\nFrom:2104\nAmount:SAR 52.45\nAt:Keemart\n28/1/26 14:28AlRajhiBank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "2104", "destination_account_last4": null, "card_info": "mada-Apple Pay 2104", "amount": 52.45, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 14:28", "available_balance": null, "beneficiary": null, "merchant": "Keemart", "sender_name": null, "description": "Purchase at Keemart"}	2026-01-28 14:28:32.845968
0f3e67b6-8b74-45fa-9f0a-c199abbe6f02	✅ **Success!**\nAccount: Expense\nAmount: 7.0 SAR\nMerchant: GOT COOKI\nBalance: 84420.13 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 7.0, "currency": "SAR", "fees": 0.0, "timestamp": "2026-01-28 00:00", "available_balance": 84420.13, "beneficiary": null, "merchant": "GOT COOKI", "sender_name": null, "description": "Purchase at GOT COOKI"}	2026-01-28 14:33:20.14363
ededd7d3-a001-43da-81d6-e7efcb2092de	✅ **Success!**\nAccount: Expense\nAmount: 16.0 SAR\nMerchant: CITY FRES\nBalance: 84404.13 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 16.0, "currency": "SAR", "fees": null, "timestamp": null, "available_balance": 84404.13, "beneficiary": null, "merchant": "CITY FRES", "sender_name": null, "description": "Purchase at CITY FRES"}	2026-01-28 14:33:24.577323
e664bac1-a8d3-4957-8a4c-9639a8471fb9	✅ **Success!**\nAccount: Expense\nAmount: 50.0 SAR\nMerchant: HABIBAH S\nBalance: 84354.13 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 50.0, "currency": "SAR", "fees": null, "timestamp": null, "available_balance": 84354.13, "beneficiary": null, "merchant": "HABIBAH S", "sender_name": null, "description": "Purchase at HABIBAH S"}	2026-01-28 14:33:33.272402
aa5328d9-7bcf-4f17-8bc6-2913e4a19570	✅ **Success!**\nAccount: Grocery\nAmount: 36.0 SAR\nMerchant: HABIBAH S\nBalance: 432.84 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "2104", "destination_account_last4": null, "card_info": null, "amount": 36.0, "currency": "SAR", "fees": null, "timestamp": null, "available_balance": 432.84, "beneficiary": null, "merchant": "HABIBAH S", "sender_name": null, "description": "Purchase at HABIBAH S"}	2026-01-28 14:33:37.510269
afdda168-324a-4f8c-a731-045722100b65	✅ **Success!**\nAccount: Expense\nAmount: 47.65 SAR\nMerchant: Alsawadi R\nBalance: 84306.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 47.65, "currency": "SAR", "fees": 0, "timestamp": "2026-01-28 00:00", "available_balance": 84306.48, "beneficiary": null, "merchant": "Alsawadi R", "sender_name": null, "description": "Purchase at Alsawadi R"}	2026-01-28 14:33:46.044957
64d60802-9fca-497a-8c71-99fd46d36b00	✅ **Success!**\nAccount: Auto Lease\nAmount: 3032.19 SAR\nMerchant: Loan Instalment\nBalance: -3032.19 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "payment", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "5225", "destination_account_last4": null, "card_info": null, "amount": 3032.19, "currency": "SAR", "fees": null, "timestamp": null, "available_balance": -3032.19, "beneficiary": null, "merchant": "Loan Instalment", "sender_name": null, "description": "Payment to Loan Instalment"}	2026-01-28 14:34:40.035061
3a2d12f2-d62c-40c5-aa06-2c8787824411	✅ **Success!**\nAccount: Expense\nAmount: 96 SAR\nMerchant: IQFAL ALA\nBalance: 84114.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 96, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 84114.48, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 14:34:52.934813
ee3e8c43-e062-41eb-b254-a0dfaaf8693e	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 84024.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 84024.48, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 14:34:57.507075
01fd3eb5-de19-4ca4-a74e-cc0d46c6f4a4	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 83934.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": 0, "timestamp": "2026-01-28 00:00", "available_balance": 83934.48, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 14:35:01.914098
91190669-3f1a-4dfa-8264-e146ce40018f	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 83844.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 83844.48, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 14:35:06.099799
89e7f90d-d29f-4bb9-afad-1b9605726d49	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: IQFAL ALA\nBalance: 83754.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": 0, "timestamp": "2026-01-28 00:00", "available_balance": 83754.48, "beneficiary": null, "merchant": "IQFAL ALA", "sender_name": null, "description": "Purchase at IQFAL ALA"}	2026-01-28 14:35:37.267281
468cda9c-c011-4c6c-881d-282c8189b63c	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83664.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 83664.48, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 14:35:42.382841
756e6633-fbc9-4909-87ec-ced84bac8799	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83574.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 83574.48, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 14:35:50.910514
ab17fa20-6f5f-48f3-9285-6efa674af040	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83484.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": null, "timestamp": null, "available_balance": 83484.48, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 14:35:55.210967
9548565d-6bdd-4ce4-89da-8e5631aa1185	✅ **Success!**\nAccount: Expense\nAmount: 90.0 SAR\nMerchant: Test\nBalance: 83394.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90.0, "currency": "SAR", "fees": null, "timestamp": null, "available_balance": 83394.48, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 14:36:37.019431
3946c589-5527-4625-9247-047da541452a	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83304.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": null, "timestamp": null, "available_balance": 83304.48, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 14:36:44.318812
fe25a93c-12b8-477c-b7a8-7a758183ae02	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83214.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 83214.48, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 14:36:49.102285
029428fa-97f1-415f-8b15-86a7cbcc60db	✅ **Success!**\nAccount: Expense\nAmount: 90 SAR\nMerchant: Test\nBalance: 83124.48 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 90, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 83124.48, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 14:36:53.076932
8180c280-8d50-4c3f-8e8e-9312a37d9a02	✅ **Success!**\nAccount: Grocery\nAmount: 52.45 SAR\nMerchant: Keemart\nBalance: 380.39 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "2104", "destination_account_last4": null, "card_info": null, "amount": 52.45, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 380.39, "beneficiary": null, "merchant": "Keemart", "sender_name": null, "description": "Purchase at Keemart"}	2026-01-28 14:36:58.273558
df266480-5827-4b7c-adf4-41e529d97660	✅ **Success!**\nAccount: Grocery\nAmount: 52.45 SAR\nMerchant: Keemart\nBalance: 327.94 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "2104", "destination_account_last4": null, "card_info": null, "amount": 52.45, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 00:00", "available_balance": 327.94, "beneficiary": null, "merchant": "Keemart", "sender_name": null, "description": "Purchase at Keemart"}	2026-01-28 14:37:02.524117
46fd3469-bc25-43d1-b83c-ba67caeb65f7	+966566985112 —— PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 900\nAt:Test\n28/1/26 11:05	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": null, "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 900, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 11:05", "available_balance": null, "beneficiary": null, "merchant": "Test", "sender_name": null, "description": "Purchase at Test"}	2026-01-28 15:58:39.158474
c4277647-1ab2-48c4-8faf-9037f11c99be	AlRajhiBank —— PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 119.27\nAt:BERAIN CO\n28/1/26 17:46	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "9365", "destination_account_last4": null, "card_info": "mada-Apple Pay 9365", "amount": 119.27, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 17:46", "available_balance": null, "beneficiary": null, "merchant": "BERAIN CO", "sender_name": null, "description": "Purchase at BERAIN CO"}	2026-01-28 17:45:47.853231
419a7b85-3ffc-41b9-865d-dd5fd9e8bebb	AlRajhiBank —— Credit Card:Payment\nCard:Visa 7868\nAmount:USD 50\nBalance:51 USD\n28/1/26 18:51	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "payment", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": null, "destination_account_last4": "7868", "card_info": "Visa 7868", "amount": 50, "currency": "USD", "fees": null, "timestamp": "2026-01-28 18:51", "available_balance": 51, "beneficiary": null, "merchant": null, "sender_name": null, "description": "Credit Card Payment"}	2026-01-28 18:51:27.756737
a2bfbc3f-e9f3-4d72-87e3-18b31bcc2827	AlRajhiBank —— Online Purchase\nCard:7868 ;Visa\nAmount:49.99 USD\nAt: PADDLE.NE\nCountry:UK\nBalance:1.01 USD\n28/1/26 18:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "destination_bank": null, "source_account_last4": "7868", "destination_account_last4": null, "card_info": "Visa 7868", "amount": 49.99, "currency": "USD", "fees": null, "timestamp": "2026-01-28 18:52", "available_balance": 1.01, "beneficiary": null, "merchant": "PADDLE.NE", "sender_name": null, "description": "Purchase at PADDLE.NE"}	2026-01-28 18:51:59.21733
ff614bf1-9d8f-47cd-98af-ad3750455bfc	+966566985112 —— Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 2,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-13 13:36\nRef: 2BTMS11336096857	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhi Bank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 2000.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-13 13:36", "available_balance": null, "beneficiary": "MUATH ALAS**", "merchant": null, "sender_name": null, "category": "Transfer", "description": "Transfer to AlRajhi"}	2026-01-28 22:07:32.124683
d20e8326-65d3-40a3-b1a6-29b8191f26cf	+966566985112 —— Credit Transfer Local\nVia:BJAZ\nAmount:SAR 2000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26-1-13 13:36	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "amount": 2000, "currency": "SAR", "sender_name": "MUATH AMER MOHAMMED ALASIRI", "category": "Transfer", "timestamp": "2026-01-26 13:36", "description": "Incoming transfer from Jazira Bank"}	2026-01-28 22:08:26.331848
0cb3b4ac-582a-4913-9f3f-f77b22d877a5	AlRajhiBank —— Credit Card:Payment\nCard:Visa 7868\nAmount:SAR 649\nBalance:737.58 SAR\n28/1/26 22:24	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "payment", "source_bank": "AlRajhiBank", "destination_account_last4": "7868", "card_info": "Visa 7868", "amount": 649, "currency": "SAR", "available_balance": 737.58, "timestamp": "2026-01-28 22:24", "description": "Credit Card Payment"}	2026-01-28 22:24:05.671361
4bb779e6-670f-4b5d-8ce9-bbcce443cb4e	AlRajhiBank —— Online Purchase\nBy:7868 ;Visa\nAmount:731.31 SAR\nAt:Amazon SA\nBalance:6.27 SAR\n28/1/26 22:24	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "AlRajhiBank", "source_account_last4": "7868", "card_info": "Visa 7868", "amount": 731.31, "currency": "SAR", "fees": null, "timestamp": "2026-01-28 22:24", "available_balance": 6.27, "beneficiary": null, "merchant": "Amazon SA", "sender_name": null, "category": "Shopping", "description": "Purchase at Amazon SA"}	2026-01-28 22:24:17.283267
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, account_id, amount, merchant, "timestamp", raw_sms_content, category, balance_after_transaction, logo_url, type, status, notes, fees, original_amount, original_currency, exchange_rate, parsed_data, credit_card_id) FROM stdin;
\.


--
-- Name: account_aliases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.account_aliases_id_seq', 9, true);


--
-- Name: obligation_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.obligation_history_id_seq', 373, true);


--
-- Name: account_aliases account_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_aliases
    ADD CONSTRAINT account_aliases_pkey PRIMARY KEY (id);


--
-- Name: account_audits account_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_audits
    ADD CONSTRAINT account_audits_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: allocation_history allocation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_history
    ADD CONSTRAINT allocation_history_pkey PRIMARY KEY (id);


--
-- Name: allocation_rules allocation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_rules
    ADD CONSTRAINT allocation_rules_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: credit_cards credit_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_cards
    ADD CONSTRAINT credit_cards_pkey PRIMARY KEY (id);


--
-- Name: currency_wallets currency_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.currency_wallets
    ADD CONSTRAINT currency_wallets_pkey PRIMARY KEY (id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: payments obligation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT obligation_history_pkey PRIMARY KEY (id);


--
-- Name: obligations obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.obligations
    ADD CONSTRAINT obligations_pkey PRIMARY KEY (id);


--
-- Name: raw_messages raw_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.raw_messages
    ADD CONSTRAINT raw_messages_pkey PRIMARY KEY (id);


--
-- Name: savings_goals savings_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.savings_goals
    ADD CONSTRAINT savings_goals_pkey PRIMARY KEY (id);


--
-- Name: training_examples training_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_examples
    ADD CONSTRAINT training_examples_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: ix_account_aliases_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_account_aliases_id ON public.account_aliases USING btree (id);


--
-- Name: ix_accounts_last_4_digits; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_accounts_last_4_digits ON public.accounts USING btree (last_4_digits);


--
-- Name: ix_credit_cards_last_4_digits; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_credit_cards_last_4_digits ON public.credit_cards USING btree (last_4_digits);


--
-- Name: ix_payments_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_payments_id ON public.payments USING btree (id);


--
-- Name: account_aliases account_aliases_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_aliases
    ADD CONSTRAINT account_aliases_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: account_audits account_audits_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_audits
    ADD CONSTRAINT account_audits_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: allocation_rules allocation_rules_target_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_rules
    ADD CONSTRAINT allocation_rules_target_account_id_fkey FOREIGN KEY (target_account_id) REFERENCES public.accounts(id);


--
-- Name: currency_wallets currency_wallets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.currency_wallets
    ADD CONSTRAINT currency_wallets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: transactions fk_transaction_credit_card; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transaction_credit_card FOREIGN KEY (credit_card_id) REFERENCES public.credit_cards(id);


--
-- Name: payments obligation_history_obligation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT obligation_history_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES public.obligations(id);


--
-- Name: payments payments_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: transactions transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- PostgreSQL database dump complete
--

\unrestrict AgJP6pt45ykvmOzK6FXb6PW9wmwIIXkbMxRNFIe5XnSueCrxv0UCouPS03So6Ro

