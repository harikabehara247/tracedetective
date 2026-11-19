import json, sys
out = sys.argv[1]
BASE = 1795000000000.0
def mk(trace_id, name, desc, rows):
    spans=[]
    for r in rows:
        sid,parent,svc,nm,kind,start,dur,status,attrs = r
        s={"traceId":trace_id,"spanId":sid,"name":nm,"service":svc,"kind":kind,"startTimeMs":BASE+start,"durationMs":dur,"status":status,"attributes":attrs}
        if parent: s["parentSpanId"]=parent
        spans.append(s)
    return {"schemaVersion":"1.0","traceId":trace_id,"name":name,"description":desc,"synthetic":True,"spans":spans}

GW={"http.request.method":"POST","http.route":"/api/orders","url.path":"/api/orders"}
SEL={"db.system.name":"postgresql","db.namespace":"shop","db.operation.name":"SELECT","db.query.text":"SELECT sku, qty_available FROM inventory WHERE sku = ANY($1)"}
INS={"db.system.name":"postgresql","db.namespace":"shop","db.operation.name":"INSERT","db.query.text":"INSERT INTO orders (customer_id, total_cents, status) VALUES ($1, $2, $3) RETURNING id"}
PAY={"http.request.method":"POST","server.address":"payments.internal.example","url.full":"http://payments.internal.example/v1/authorize"}
PUB={"messaging.system":"kafka","messaging.destination.name":"order.created","messaging.operation.type":"send"}
AUTH={"rpc.system":"grpc","rpc.service":"auth.v1.Tokens","rpc.method":"Verify","server.address":"auth.internal.example"}

def order(tid, name, desc, sel_dur, pay_dur, extra_pay_children=None, gw_tail=12, ord_tail=8, sel_attrs=None):
    t=0; rows=[]
    sel_s=32; sel_e=sel_s+sel_dur
    pay_s=sel_e+4; pay_e=pay_s+pay_dur
    ins_s=pay_e+6; ins_e=ins_s+46
    pub_s=ins_e+4; pub_e=pub_s+14
    ser_s=pub_e+2; ser_e=ser_s+48
    ord_e=ser_e+ord_tail; gw_e=ord_e+gw_tail
    rows=[
     ("gw-1",None,"api-gateway","POST /api/orders","server",0,gw_e,"ok",{**GW,"http.response.status_code":201}),
     ("auth-1","gw-1","api-gateway","auth.v1.Tokens/Verify","client",4,18,"ok",AUTH),
     ("ord-1","gw-1","order-service","POST /orders","server",26,ord_e-26,"ok",{"http.request.method":"POST","http.route":"/orders","http.response.status_code":201}),
     ("db-sel-1","ord-1","order-service","SELECT inventory","client",sel_s,sel_dur,"ok",{**SEL,**(sel_attrs or {})}),
     ("pay-1","ord-1","order-service","payment.authorize","client",pay_s,pay_dur,"ok",{**PAY,"http.response.status_code":200}),
    ]
    rows += (extra_pay_children(pay_s,pay_e) if extra_pay_children else [])
    rows += [
     ("db-ins-1","ord-1","order-service","INSERT orders","client",ins_s,46,"ok",INS),
     ("pub-1","ord-1","order-service","publish order.created","producer",pub_s,14,"ok",PUB),
     ("ser-1","ord-1","order-service","serialize response","internal",ser_s,48,"ok",{}),
    ]
    return mk(tid,name,desc,rows)

healthy=order("4bf92f3577b34da6a3ce929d0e0e4736","Healthy order request","Synthetic baseline: POST /api/orders completing normally in about 450 ms.",38,210,gw_tail=36)
slowdb=order("8a3c60f7d188f8fa79d48a391a778fa6","Slow database query","Synthetic regression: the inventory lookup takes about 2.6 s, pushing the request past 3 s.",2652,210,
             ord_tail=210, sel_attrs={"db.response.returned_rows":18})
def card(ps,pe):
    return [
     ("pay-srv-1","pay-1","payment-service","POST /v1/authorize","server",ps+4,(pe-ps)-8,"ok",{"http.request.method":"POST","http.route":"/v1/authorize","http.response.status_code":200}),
     ("card-1","pay-srv-1","payment-service","card-network.authorize","client",ps+14,(pe-ps)-34,"ok",{"http.request.method":"POST","server.address":"api.card-network.example","url.full":"https://api.card-network.example/authorizations","http.response.status_code":200}),
    ]
ext=order("d4cda95b652f4a1592b449d5929fda1b","Slow external payment provider","Synthetic regression: the card network call inside payment-service takes about 2.2 s.",38,2280,extra_pay_children=card)
# error trace
E="0af7651916cd43dd8448eb211c80319c"
err=mk(E,"Failing payment dependency","Synthetic failure: payment-service returns 503 twice and the order request fails with 502.",[
 ("gw-1",None,"api-gateway","POST /api/orders","server",0,372,"error",{**GW,"http.response.status_code":502}),
 ("auth-1","gw-1","api-gateway","auth.v1.Tokens/Verify","client",4,18,"ok",AUTH),
 ("ord-1","gw-1","order-service","POST /orders","server",26,326,"error",{"http.request.method":"POST","http.route":"/orders","http.response.status_code":502,"error.type":"UpstreamUnavailable"}),
 ("db-sel-1","ord-1","order-service","SELECT inventory","client",32,38,"ok",SEL),
 ("pay-1","ord-1","order-service","payment.authorize","client",74,122,"error",{**PAY,"http.response.status_code":503,"http.request.resend_count":0,"error.message":"503 Service Unavailable"}),
 ("pay-2","ord-1","order-service","payment.authorize","client",246,98,"error",{**PAY,"http.response.status_code":503,"http.request.resend_count":1,"error.message":"503 Service Unavailable"}),
])
for fn,doc in [("healthy-order",healthy),("slow-database",slowdb),("external-payment",ext),("failing-dependency",err)]:
    json.dump(doc,open(f"{out}/{fn}.json","w"),indent=2)
    spans=doc["spans"]; s=min(x["startTimeMs"] for x in spans); e=max(x["startTimeMs"]+x["durationMs"] for x in spans)
    print(fn, e-s)
