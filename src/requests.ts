import axios, {type AxiosInstance, type AxiosRequestConfig} from "axios";

const api: AxiosInstance = axios.create({
    baseURL: window.location.hostname.includes("localhost")
        ? "http://localhost:8080"
        : "",
    withCredentials: true,
});

export const get = <T = unknown>(
    url: string,
    config?: AxiosRequestConfig
) => api.get<T>(url, config);

export const post = <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
) => api.post<T>(url, data, config);

export const del = <T = unknown>(
    url: string,
    config?: AxiosRequestConfig
) => api.delete<T>(url, config);


export const put = <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
) => api.put<T>(url, data, config);

export const patch = <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
) => api.patch<T>(url, data, config);

export const postForm = <T = unknown>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig
) => api.postForm<T>(url, data, config);