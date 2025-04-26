import { Component } from '@angular/core';
import { RouterModule, Routes, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';
import { ChildrenOutletContexts } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterModule, 
    RouterOutlet, 
    HeaderComponent, 
    FooterComponent, 
    FormsModule, 
    CommonModule,
    HttpClientModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'DiplomProject';
  apiUrl = 'http://localhost:3000/api'; // Базовый URL API
  
  constructor(
    private contexts: ChildrenOutletContexts,
    private http: HttpClient
  ) {}

  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }

  // Состояние компонента
  isModalOpen = false;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  
  // Данные формы
  formData = {
    name: '',
    phone: '',
    message: '',
    source: 'web' // Добавляем источник заявки
  };

  // Открытие модального окна
  openModal() {
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden';
    this.resetMessages();
  }

  // Закрытие модального окна
  closeModal() {
    this.isModalOpen = false;
    document.body.style.overflow = '';
    this.resetMessages();
  }

  // Сброс сообщений
  private resetMessages() {
    this.errorMessage = '';
    this.successMessage = '';
  }

  // Валидация формы
  private validateForm(): boolean {
    if (!this.formData.name || !this.formData.phone) {
      this.errorMessage = 'Пожалуйста, заполните обязательные поля (имя и телефон)';
      return false;
    }
    
    // Простая валидация телефона
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(this.formData.phone)) {
      this.errorMessage = 'Пожалуйста, введите корректный номер телефона';
      return false;
    }
    
    return true;
  }

  // Отправка формы
  submitForm() {
    if (!this.validateForm()) return;

    this.isLoading = true;
    this.resetMessages();

    // Подготовка данных для отправки
    const requestData = {
      ...this.formData,
      created_at: new Date().toISOString() // Добавляем timestamp
    };

    // Отправка данных на сервер
    this.http.post(`${this.apiUrl}/requests`, requestData)
      .pipe(
        catchError(error => {
          this.handleError(error);
          return throwError(error);
        })
      )
      .subscribe({
        next: (response) => this.handleSuccess(response),
        error: () => this.isLoading = false
      });
  }

  // Обработка успешной отправки
  private handleSuccess(response: any) {
    this.isLoading = false;
    this.successMessage = 'Ваша заявка принята! Мы свяжемся с вами в ближайшее время.';
    console.log('Заявка успешно отправлена:', response);
    
    // Очистка формы через 2 секунды
    setTimeout(() => {
      this.closeModal();
      this.resetForm();
    }, 2000);
  }

  // Обработка ошибок
  private handleError(error: any) {
    this.isLoading = false;
    console.error('Ошибка при отправке:', error);
    
    if (error.status === 0) {
      this.errorMessage = 'Ошибка соединения с сервером. Проверьте интернет-соединение.';
    } else if (error.status === 400) {
      this.errorMessage = 'Неверные данные формы. Пожалуйста, проверьте введенные данные.';
    } else {
      this.errorMessage = 'Произошла ошибка при отправке заявки. Пожалуйста, попробуйте позже.';
    }
  }

  // Сброс формы
  private resetForm() {
    this.formData = {
      name: '',
      phone: '',
      message: '',
      source: 'web'
    };
  }
}