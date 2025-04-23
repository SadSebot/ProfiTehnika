
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'http://localhost:4000/api'; // URL вашего Node.js сервера

  constructor(private http: HttpClient) { }

  getMasters(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/masters`);
  }
}