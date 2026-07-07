import axios, { isAxiosError } from 'axios';
import { API_URL } from '@/lib/config';

/** Axios instance dùng chung — baseURL trỏ backend, không cần lặp `${API_URL}/...` */
export const api = axios.create({
  baseURL: API_URL,
});

export { isAxiosError };

export default api;
  