import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 20,
  duration: "2m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const resHome = http.get(`${BASE_URL}/`);
  check(resHome, { "GET / is 200": (r) => r.status === 200 });
  sleep(0.4);

  const resPricing = http.get(`${BASE_URL}/pricing`);
  check(resPricing, { "GET /pricing is 200": (r) => r.status === 200 });
  sleep(0.4);

  const resSignin = http.get(`${BASE_URL}/signin`);
  check(resSignin, { "GET /signin is 200": (r) => r.status === 200 });
  sleep(0.4);
}
